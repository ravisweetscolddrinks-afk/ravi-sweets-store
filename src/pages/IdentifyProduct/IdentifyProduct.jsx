import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Camera,
  Scan,
  ScanLine,
  CheckCircle2,
  Plus,
  Minus,
  Store as StoreIcon,
  Package,
  Sparkles,
  RefreshCw,
  Search,
  ArrowRight,
  Boxes,
  Zap,
  AlertCircle,
  X,
  Volume2,
  VolumeX,
  FlipHorizontal,
  ChevronRight,
  Eye,
  SlidersHorizontal
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { subscribeStoreStock, saveItemStock } from '../../utils/stockService';
import {
  extractImageFeatures,
  compareFeatures,
  extractFeaturesFromUrl
} from '../../utils/visualMatcher';
import CustomDropdown from '../../components/Common/CustomDropdown';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '../../assets/logo.png';
import './IdentifyProduct.css';

const DEFAULT_ITEM_IMAGE = logo;

const IdentifyProduct = () => {
  // Store & Catalog states
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [storeStockMap, setStoreStockMap] = useState({});
  const [loading, setLoading] = useState(true);

  // In-memory cache of pre-extracted product visual features: { [itemId]: features }
  const catalogFeaturesRef = useRef({});
  const [indexedCount, setIndexedCount] = useState(0);

  // Camera & Scanner states
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('environment'); // 'environment' (back) or 'user' (front)
  const [cameraError, setCameraError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scannerPaused, setScannerPaused] = useState(false);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  // Matched product & captured frame states
  const [capturedSnapshot, setCapturedSnapshot] = useState(null);
  const [matchedProduct, setMatchedProduct] = useState(null);
  const [candidateMatches, setCandidateMatches] = useState([]);
  const [addQuantity, setAddQuantity] = useState('1');
  const [isSubmittingStock, setIsSubmittingStock] = useState(false);
  const [lastAddedSuccess, setLastAddedSuccess] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Fallback search
  const [searchFallback, setSearchFallback] = useState('');

  // Audio confirmation beep
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } catch (e) {}
  };

  // 1. Fetch Stores & Categories
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [storesSnap, catsSnap] = await Promise.all([
          getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'categories'), orderBy('name', 'asc')))
        ]);

        const storeList = storesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStores(storeList);
        if (storeList.length > 0 && !selectedStoreId) {
          setSelectedStoreId(storeList[0].id);
        }

        setCategories(catsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Failed to load initial data:", err);
        toast.error("Failed to load stores");
      }
    };
    fetchInitialData();
  }, []);

  // 2. Fetch Items Catalog
  useEffect(() => {
    const q = query(collection(db, 'items'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const allItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(allItems);
      setLoading(false);
    }, (err) => {
      console.error(err);
      toast.error("Error loading products");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 3. Pre-index and cache visual signatures for all catalog items that have photos
  useEffect(() => {
    if (!items || items.length === 0) return;

    let count = 0;
    items.forEach((item) => {
      const imgUrl = item.image;
      if (!imgUrl || typeof imgUrl !== 'string' || imgUrl.trim() === '' || imgUrl === DEFAULT_ITEM_IMAGE) {
        return;
      }
      if (catalogFeaturesRef.current[item.id]) {
        count++;
        return;
      }

      extractFeaturesFromUrl(imgUrl)
        .then((features) => {
          catalogFeaturesRef.current[item.id] = features;
          setIndexedCount(prev => prev + 1);
        })
        .catch(() => {
          // silently skip inaccessible images
        });
    });
  }, [items]);

  // 4. Subscribe to store stock for selected store
  useEffect(() => {
    if (!selectedStoreId) return;
    const unsub = subscribeStoreStock(selectedStoreId, (stockMap) => {
      setStoreStockMap(stockMap);
    });
    return () => unsub();
  }, [selectedStoreId]);

  // 5. Camera Management
  const startCamera = async () => {
    setCameraError(null);
    stopCamera();

    try {
      const constraints = {
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        startAutoScanner();
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? "Camera permission denied. Please allow camera access in your browser settings."
          : `Unable to access camera: ${err.message}`
      );
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const toggleCameraFacing = () => {
    setCameraFacing(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [cameraFacing]);

  // 6. Real-time Barcode Detection
  const startAutoScanner = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    scanIntervalRef.current = setInterval(async () => {
      if (scannerPaused || !videoRef.current || videoRef.current.readyState < 2) return;

      if ('BarcodeDetector' in window) {
        try {
          const barcodeDetector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']
          });
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const rawCode = (barcodes[0].rawValue || '').trim();
            handleBarcodeFound(rawCode);
            return;
          }
        } catch (e) {}
      }
    }, 600);
  };

  const handleBarcodeFound = (barcodeStr) => {
    if (!barcodeStr || scannerPaused) return;

    const matched = items.find(
      i => (i.barcode && i.barcode.trim().toLowerCase() === barcodeStr.toLowerCase()) ||
           i.id === barcodeStr
    );

    if (matched) {
      playBeep();
      setScannerPaused(true);
      setCapturedSnapshot(null);
      setMatchedProduct({ ...matched, matchConfidence: 100, matchReason: `Exact Barcode Match (${barcodeStr})` });
      setCandidateMatches([]);
      setAddQuantity(matched.unit === 'Weight' ? '1.0' : '1');
      toast.success(`Matched: ${matched.name}!`, { icon: '🎯' });
    }
  };

  // 7. Manual Frame Capture & Real Product Image Comparison
  const captureAndIdentify = async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      toast.error("Camera is not ready yet");
      return;
    }

    setIsAnalyzing(true);
    setScannerPaused(true);

    try {
      const video = videoRef.current;
      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 480;

      // Check native barcode detector first
      if ('BarcodeDetector' in window) {
        try {
          const barcodeDetector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']
          });
          const barcodes = await barcodeDetector.detect(video);
          if (barcodes && barcodes.length > 0) {
            const code = (barcodes[0].rawValue || '').trim();
            const matched = items.find(i => (i.barcode && i.barcode.trim().toLowerCase() === code.toLowerCase()) || i.id === code);
            if (matched) {
              playBeep();
              setMatchedProduct({ ...matched, matchConfidence: 100, matchReason: `Barcode: ${code}` });
              setCandidateMatches([]);
              setAddQuantity(matched.unit === 'Weight' ? '1.0' : '1');
              setIsAnalyzing(false);
              return;
            }
          }
        } catch (e) {}
      }

      // Crop the center reticle area where the product is positioned
      const cropW = vWidth * 0.65;
      const cropH = vHeight * 0.65;
      const cropX = (vWidth - cropW) / 2;
      const cropY = (vHeight - cropH) / 2;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = 120;
      cropCanvas.height = 120;
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, 120, 120);

      // Save preview snapshot of what camera saw
      const snapshotUrl = cropCanvas.toDataURL('image/jpeg', 0.85);
      setCapturedSnapshot(snapshotUrl);

      // Extract visual features of camera capture
      const cameraFeatures = extractImageFeatures(cropCanvas, 64, 64);

      // Compare against every item with an image in the catalog
      const comparisonList = await Promise.all(
        items.map(async (item) => {
          let itemFeatures = catalogFeaturesRef.current[item.id];
          if (!itemFeatures && item.image && item.image !== DEFAULT_ITEM_IMAGE) {
            try {
              itemFeatures = await extractFeaturesFromUrl(item.image, 2500);
              catalogFeaturesRef.current[item.id] = itemFeatures;
            } catch (e) {}
          }

          if (!itemFeatures) {
            return { item, similarity: 0, hasImage: false };
          }

          const similarity = compareFeatures(cameraFeatures, itemFeatures);
          return { item, similarity, hasImage: true };
        })
      );

      // Filter only items that have product images and sort by similarity descending
      const rankedMatches = comparisonList
        .filter(r => r.hasImage && r.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity);

      if (rankedMatches.length === 0) {
        toast.error("No product photos found in catalog to compare against");
        setScannerPaused(false);
        setIsAnalyzing(false);
        return;
      }

      const topResult = rankedMatches[0];
      const topPercentage = Math.round(topResult.similarity * 100);

      const alternateCandidates = rankedMatches.slice(1, 5).map(r => ({
        ...r.item,
        matchConfidence: Math.round(r.similarity * 100),
        matchReason: `Visual Similarity (${Math.round(r.similarity * 100)}%)`
      }));

      playBeep();
      setMatchedProduct({
        ...topResult.item,
        matchConfidence: topPercentage,
        matchReason: `Product Photo Match (${topPercentage}%)`
      });
      setCandidateMatches(alternateCandidates);
      setAddQuantity(topResult.item.unit === 'Weight' ? '1.0' : '1');

      if (topPercentage >= 50) {
        toast.success(`Matched: ${topResult.item.name} (${topPercentage}% match)!`, { icon: '🎯' });
      } else {
        toast(`Best match: ${topResult.item.name} (${topPercentage}%). Check candidates below if not exact.`, { icon: 'ℹ️' });
      }
    } catch (err) {
      console.error("Visual recognition error:", err);
      toast.error("Failed to analyze product image");
      setScannerPaused(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleScanAnother = () => {
    setMatchedProduct(null);
    setCandidateMatches([]);
    setCapturedSnapshot(null);
    setScannerPaused(false);
    setLastAddedSuccess(null);
  };

  const getExistingStock = (itemId) => {
    const entry = storeStockMap[itemId];
    return entry ? Number(entry.currentStock || 0) : 0;
  };

  // Add identified product quantity to store stock
  const handleAddToStock = async () => {
    if (!selectedStoreId) return toast.error("Please select a store first");
    if (!matchedProduct) return toast.error("No product selected");

    const qtyNum = parseFloat(addQuantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      return toast.error("Please enter a valid positive quantity");
    }

    setIsSubmittingStock(true);
    try {
      const existing = getExistingStock(matchedProduct.id);
      const isWeight = matchedProduct.unit === 'Weight';
      const cleanQty = isWeight ? parseFloat(qtyNum.toFixed(3)) : Math.round(qtyNum);
      const newStock = isWeight ? parseFloat((existing + cleanQty).toFixed(3)) : existing + cleanQty;

      await saveItemStock({
        storeId: selectedStoreId,
        item: matchedProduct,
        existingStock: existing,
        newStock,
        delta: cleanQty,
        updateType: 'increment',
        reason: `Camera Visual Scan: +${cleanQty} ${isWeight ? 'kg' : 'pcs'}`
      });

      setLastAddedSuccess({
        item: matchedProduct,
        added: cleanQty,
        previous: existing,
        newStock
      });

      toast.success(
        `Added +${cleanQty} ${isWeight ? 'kg' : 'pcs'} to ${matchedProduct.name}! New Stock: ${newStock}`,
        { duration: 4000 }
      );
    } catch (err) {
      console.error(err);
      toast.error(`Failed to update stock: ${err.message}`);
    } finally {
      setIsSubmittingStock(false);
    }
  };

  // Filtered manual fallback items
  const filteredCatalogItems = useMemo(() => {
    if (!searchFallback) return [];
    return items
      .filter(i => (i.name || '').toLowerCase().includes(searchFallback.toLowerCase()) ||
                   (i.barcode || '').toLowerCase().includes(searchFallback.toLowerCase()))
      .slice(0, 6);
  }, [items, searchFallback]);

  const selectedStoreObj = stores.find(s => s.id === selectedStoreId);
  const existingStockForMatched = matchedProduct ? getExistingStock(matchedProduct.id) : 0;
  const isWeightItem = matchedProduct?.unit === 'Weight';
  const newProjectedStock = matchedProduct
    ? (isWeightItem
        ? parseFloat((existingStockForMatched + (parseFloat(addQuantity) || 0)).toFixed(3))
        : existingStockForMatched + Math.round(parseFloat(addQuantity) || 0))
    : 0;

  return (
    <div className="identify-page-container">
      {/* Top Header Bar */}
      <div className="identify-header">
        <div className="identify-header-info">
          <div className="identify-header-badge">
            <ScanLine size={15} />
            <span>Product Visual Scanner</span>
          </div>
          <h1>Identify Product & Restock</h1>
          <p>
            Capture camera photo to compare directly against product catalog images, preview current store stock, and restock
          </p>
        </div>

        {/* Store Picker & Audio Toggle */}
        <div className="identify-header-controls">
          <div className="identify-store-picker">
            <span className="identify-store-label">Restock Store:</span>
            <CustomDropdown
              options={stores.map(s => ({ value: s.id, label: s.name + (s.city ? ` (${s.city})` : '') }))}
              value={selectedStoreId}
              onChange={(val) => setSelectedStoreId(val)}
              placeholder="Select Store"
              icon={<StoreIcon size={15} />}
              className="identify-dropdown"
            />
          </div>

          <button
            type="button"
            className={`identify-audio-btn ${soundEnabled ? 'active' : ''}`}
            onClick={() => setSoundEnabled(p => !p)}
            title={soundEnabled ? "Mute beep sound" : "Enable beep sound on match"}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </div>

      {/* Main Dual-Column Content */}
      <div className="identify-grid">
        {/* Left Column: Camera Viewfinder & Controls */}
        <div className="identify-camera-card">
          <div className="identify-camera-header">
            <div className="identify-status-pill">
              <span className={`identify-pulse-dot ${isCameraActive ? 'active' : ''}`} />
              <span>{isCameraActive ? (scannerPaused ? 'Capture Complete' : 'Live Camera Active') : 'Camera Inactive'}</span>
            </div>

            <div className="identify-cam-actions">
              <button
                type="button"
                className="identify-cam-icon-btn"
                onClick={toggleCameraFacing}
                title="Flip Front / Rear Camera"
              >
                <FlipHorizontal size={15} />
              </button>
              <button
                type="button"
                className="identify-cam-icon-btn"
                onClick={startCamera}
                title="Restart Camera"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {/* Viewfinder Frame */}
          <div className="identify-viewfinder-box">
            {cameraError ? (
              <div className="identify-cam-error">
                <AlertCircle size={36} color="#ef4444" />
                <p>{cameraError}</p>
                <button className="identify-retry-btn" onClick={startCamera}>
                  Try Again
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="identify-video-elem"
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {/* Reticle / Target Guides */}
                <div className={`identify-reticle ${scannerPaused ? 'paused' : ''}`}>
                  <div className="reticle-corner top-left" />
                  <div className="reticle-corner top-right" />
                  <div className="reticle-corner bottom-left" />
                  <div className="reticle-corner bottom-right" />

                  {!scannerPaused && isCameraActive && (
                    <div className="identify-scan-laser" />
                  )}

                  <div className="identify-reticle-label">
                    {scannerPaused ? "Photo Captured" : "Center sweet or barcode here"}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Action Button */}
          <div className="identify-cam-footer">
            {scannerPaused ? (
              <button
                type="button"
                className="identify-btn-resume"
                onClick={handleScanAnother}
              >
                <RefreshCw size={15} />
                <span>Scan Another Product</span>
              </button>
            ) : (
              <button
                type="button"
                className="identify-btn-capture"
                onClick={captureAndIdentify}
                disabled={isAnalyzing || !isCameraActive}
              >
                {isAnalyzing ? (
                  <div className="identify-spinner" />
                ) : (
                  <Camera size={16} />
                )}
                <span>Compare & Match Product Photo</span>
              </button>
            )}
          </div>

          {/* Fallback Manual Search */}
          <div className="identify-fallback-bar">
            <span className="identify-fallback-label">Or search catalog manually:</span>
            <div className="identify-search-input-wrap">
              <Search size={14} className="identify-search-icon" />
              <input
                type="text"
                placeholder="Type item name or barcode..."
                value={searchFallback}
                onChange={(e) => setSearchFallback(e.target.value)}
              />
              {searchFallback && (
                <button className="identify-clear-btn" onClick={() => setSearchFallback('')}>
                  <X size={12} />
                </button>
              )}
            </div>

            {filteredCatalogItems.length > 0 && (
              <div className="identify-search-results">
                {filteredCatalogItems.map(item => (
                  <div
                    key={item.id}
                    className="identify-search-item"
                    onClick={() => {
                      setMatchedProduct({ ...item, matchConfidence: 100, matchReason: 'Manual Selection' });
                      setCandidateMatches([]);
                      setCapturedSnapshot(null);
                      setScannerPaused(true);
                      setAddQuantity(item.unit === 'Weight' ? '1.0' : '1');
                      setSearchFallback('');
                    }}
                  >
                    <img
                      src={item.image || DEFAULT_ITEM_IMAGE}
                      alt={item.name}
                      onError={(e) => { e.target.src = DEFAULT_ITEM_IMAGE; }}
                    />
                    <div className="identify-search-item-info">
                      <span className="name">{item.name}</span>
                      <span className="sub">₹{item.price} • {item.unit} • Stock: {getExistingStock(item.id)}</span>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Matched Product Card & Stock Restock */}
        <div className="identify-result-column">
          {matchedProduct ? (
            <motion.div
              className="identify-match-card"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {/* Match Header Badge */}
              <div className="identify-match-top">
                <div className="identify-confidence-badge">
                  <Sparkles size={14} />
                  <span>{matchedProduct.matchConfidence || 95}% Match</span>
                </div>
                <span className="identify-match-reason">
                  {matchedProduct.matchReason}
                </span>
              </div>

              {/* Visual Comparison: Camera Photo vs Catalog Photo */}
              {capturedSnapshot && (
                <div className="identify-visual-comparison">
                  <div className="identify-comp-box">
                    <span className="identify-comp-label">Captured Photo</span>
                    <img src={capturedSnapshot} alt="Captured" className="identify-comp-img" />
                  </div>
                  <div className="identify-comp-vs">
                    <Eye size={16} />
                    <span>Visual Match</span>
                  </div>
                  <div className="identify-comp-box">
                    <span className="identify-comp-label">Catalog Photo</span>
                    <img
                      src={matchedProduct.image || DEFAULT_ITEM_IMAGE}
                      alt={matchedProduct.name}
                      className="identify-comp-img"
                      onError={(e) => { e.target.src = DEFAULT_ITEM_IMAGE; }}
                    />
                  </div>
                </div>
              )}

              {/* Product Info Row */}
              <div className="identify-product-summary">
                <img
                  src={matchedProduct.image || DEFAULT_ITEM_IMAGE}
                  alt={matchedProduct.name}
                  className="identify-product-avatar"
                  onError={(e) => { e.target.src = DEFAULT_ITEM_IMAGE; }}
                />
                <div className="identify-product-headings">
                  <h2 className="identify-product-title">{matchedProduct.name}</h2>
                  <div className="identify-product-pills">
                    <span className="identify-pill-unit">{matchedProduct.unit}</span>
                    <span className="identify-pill-price">₹{Number(matchedProduct.price).toFixed(2)}</span>
                    {matchedProduct.barcode && (
                      <span className="identify-pill-barcode">{matchedProduct.barcode}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Current Store Stock Snapshot */}
              <div className="identify-stock-status-box">
                <div className="identify-stock-item">
                  <span className="label">Current Store Stock</span>
                  <div className="identify-stock-badge in">
                    <span className="num">
                      {isWeightItem ? existingStockForMatched.toFixed(3) : existingStockForMatched}
                    </span>
                    <span className="unit">{isWeightItem ? 'kg' : 'pcs'}</span>
                  </div>
                </div>

                <ArrowRight size={18} className="identify-stock-arrow" />

                <div className="identify-stock-item">
                  <span className="label">New Resulting Stock</span>
                  <div className="identify-stock-badge projected">
                    <span className="num">
                      {isWeightItem ? newProjectedStock.toFixed(3) : newProjectedStock}
                    </span>
                    <span className="unit">{isWeightItem ? 'kg' : 'pcs'}</span>
                  </div>
                </div>
              </div>

              {/* Quantity Addition Controls */}
              <div className="identify-add-form">
                <label className="identify-input-label">
                  Enter Quantity to Add (+ Stock):
                </label>

                <div className="identify-stepper-row">
                  <div className="identify-stepper">
                    <button
                      type="button"
                      className="identify-step-btn"
                      onClick={() => {
                        const cur = parseFloat(addQuantity) || 0;
                        const step = isWeightItem ? 0.5 : 1;
                        setAddQuantity(Math.max(0.1, cur - step).toString());
                      }}
                    >
                      <Minus size={14} />
                    </button>

                    <input
                      type="number"
                      step={isWeightItem ? "0.1" : "1"}
                      min="0.1"
                      value={addQuantity}
                      onChange={(e) => setAddQuantity(e.target.value)}
                      className="identify-qty-input"
                    />

                    <button
                      type="button"
                      className="identify-step-btn"
                      onClick={() => {
                        const cur = parseFloat(addQuantity) || 0;
                        const step = isWeightItem ? 0.5 : 1;
                        setAddQuantity((cur + step).toString());
                      }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* Quick Addition Chips */}
                  <div className="identify-quick-chips">
                    {isWeightItem ? (
                      <>
                        <button type="button" onClick={() => setAddQuantity('0.5')}>+0.5 kg</button>
                        <button type="button" onClick={() => setAddQuantity('1.0')}>+1.0 kg</button>
                        <button type="button" onClick={() => setAddQuantity('2.0')}>+2.0 kg</button>
                        <button type="button" onClick={() => setAddQuantity('5.0')}>+5.0 kg</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => setAddQuantity('1')}>+1 pc</button>
                        <button type="button" onClick={() => setAddQuantity('5')}>+5 pcs</button>
                        <button type="button" onClick={() => setAddQuantity('10')}>+10 pcs</button>
                        <button type="button" onClick={() => setAddQuantity('25')}>+25 pcs</button>
                      </>
                    )}
                  </div>
                </div>

                {/* Submit to Store Stock Button */}
                <button
                  type="button"
                  className="identify-submit-btn"
                  onClick={handleAddToStock}
                  disabled={isSubmittingStock || !selectedStoreId}
                >
                  {isSubmittingStock ? (
                    <div className="identify-mini-spinner" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  <span>
                    Add +{addQuantity} {isWeightItem ? 'kg' : 'pcs'} to {selectedStoreObj?.name || 'Store'} Stock
                  </span>
                </button>
              </div>

              {/* Alternate Candidates List */}
              {candidateMatches.length > 0 && (
                <div className="identify-candidates-section">
                  <span className="identify-candidates-title">Did you mean another sweet? (Top photo matches):</span>
                  <div className="identify-candidates-list">
                    {candidateMatches.map(cand => (
                      <div
                        key={cand.id}
                        className="identify-candidate-card"
                        onClick={() => {
                          setMatchedProduct(cand);
                          setCandidateMatches(prev => prev.filter(c => c.id !== cand.id));
                          setAddQuantity(cand.unit === 'Weight' ? '1.0' : '1');
                        }}
                      >
                        <img
                          src={cand.image || DEFAULT_ITEM_IMAGE}
                          alt={cand.name}
                          onError={(e) => { e.target.src = DEFAULT_ITEM_IMAGE; }}
                        />
                        <div className="info">
                          <span className="cand-name">{cand.name}</span>
                          <span className="cand-sub">₹{cand.price} • {cand.matchConfidence}% photo likeness</span>
                        </div>
                        <button className="select-btn">Select</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="identify-placeholder-card">
              <div className="identify-placeholder-icon">
                <Scan size={36} />
              </div>
              <h3>Waiting for Product Scan</h3>
              <p>
                Aim your camera at any sweet or snack on the left and click <strong>Compare & Match Product Photo</strong> to match against your catalog photos.
              </p>
              <div className="identify-hints-list">
                <div className="identify-hint-item">
                  <Eye size={14} className="hint-icon" />
                  <span>Compares camera frame directly with your uploaded product images</span>
                </div>
                <div className="identify-hint-item">
                  <Zap size={14} className="hint-icon" />
                  <span>Instant barcode auto-detection if packaging has a barcode</span>
                </div>
                <div className="identify-hint-item">
                  <Boxes size={14} className="hint-icon" />
                  <span>Direct one-click addition to store stock</span>
                </div>
              </div>
            </div>
          )}

          {/* Success Banner */}
          <AnimatePresence>
            {lastAddedSuccess && (
              <motion.div
                className="identify-success-banner"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <CheckCircle2 size={20} color="#059669" />
                <div className="identify-success-text">
                  <strong>Stock Updated Successfully!</strong>
                  <span>
                    {lastAddedSuccess.item.name}: +{lastAddedSuccess.added} added. Current store stock is now {lastAddedSuccess.newStock} {lastAddedSuccess.item.unit === 'Weight' ? 'kg' : 'pcs'}.
                  </span>
                </div>
                <button
                  className="identify-scan-next-btn"
                  onClick={handleScanAnother}
                >
                  Scan Next
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default IdentifyProduct;
