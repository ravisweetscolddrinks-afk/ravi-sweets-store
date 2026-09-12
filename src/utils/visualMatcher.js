/**
 * Visual Matcher Utility
 * Extracts color histograms and spatial feature vectors from images
 * and computes visual similarity between camera captures and product catalog images.
 */

/**
 * Extract 64-bin RGB histogram, 24-bin Hue-Saturation histogram,
 * and 4x4 spatial layout grid from an Image or Canvas element.
 */
export const extractImageFeatures = (source, width = 64, height = 64) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Draw scaled down image
  ctx.drawImage(source, 0, 0, width, height);
  const imgData = ctx.getImageData(0, 0, width, height).data;

  const totalPixels = width * height;
  const rgbHist = new Float32Array(64); // 4x4x4 RGB bins
  const hsHist = new Float32Array(24);  // 8 Hue x 3 Saturation bins
  const grid = new Float32Array(48);    // 4x4 grid (16 blocks * 3 channels)
  const gridCounts = new Float32Array(16);

  let rTotal = 0, gTotal = 0, bTotal = 0;

  for (let y = 0; y < height; y++) {
    const gy = Math.min(3, Math.floor((y / height) * 4));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(3, Math.floor((x / width) * 4));
      const gridIdx = gy * 4 + gx;

      const idx = (y * width + x) * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];

      rTotal += r;
      gTotal += g;
      bTotal += b;

      // 64-bin RGB Index
      const rb = Math.min(3, Math.floor(r / 64));
      const gb = Math.min(3, Math.floor(g / 64));
      const bb = Math.min(3, Math.floor(b / 64));
      rgbHist[rb * 16 + gb * 4 + bb]++;

      // RGB to HSV Conversion
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      let h = 0;
      if (delta !== 0) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h = Math.round(h * 60);
        if (h < 0) h += 360;
      }
      const s = max === 0 ? 0 : delta / max;
      const hBin = Math.min(7, Math.floor(h / 45)); // 8 bins of 45 deg
      const sBin = Math.min(2, Math.floor(s * 3));  // 3 bins of saturation
      hsHist[hBin * 3 + sBin]++;

      // 4x4 Spatial color grid
      grid[gridIdx * 3] += r;
      grid[gridIdx * 3 + 1] += g;
      grid[gridIdx * 3 + 2] += b;
      gridCounts[gridIdx]++;
    }
  }

  // Normalize histograms to sum to 1
  for (let i = 0; i < 64; i++) rgbHist[i] /= totalPixels;
  for (let i = 0; i < 24; i++) hsHist[i] /= totalPixels;

  // Normalize spatial grid values to 0.0 - 1.0 range
  for (let i = 0; i < 16; i++) {
    const count = gridCounts[i] || 1;
    grid[i * 3] /= (count * 255);
    grid[i * 3 + 1] /= (count * 255);
    grid[i * 3 + 2] /= (count * 255);
  }

  return {
    rgbHist,
    hsHist,
    grid,
    avgR: rTotal / totalPixels,
    avgG: gTotal / totalPixels,
    avgB: bTotal / totalPixels
  };
};

/**
 * Compare two image feature vectors and return similarity score [0.0 - 1.0]
 */
export const compareFeatures = (f1, f2) => {
  if (!f1 || !f2) return 0;

  // 1. Cosine similarity of 64-bin RGB Histograms
  let dotRGB = 0, mag1RGB = 0, mag2RGB = 0;
  for (let i = 0; i < 64; i++) {
    dotRGB += f1.rgbHist[i] * f2.rgbHist[i];
    mag1RGB += f1.rgbHist[i] * f1.rgbHist[i];
    mag2RGB += f2.rgbHist[i] * f2.rgbHist[i];
  }
  const simRGB = (mag1RGB > 0 && mag2RGB > 0)
    ? dotRGB / (Math.sqrt(mag1RGB) * Math.sqrt(mag2RGB))
    : 0;

  // 2. Cosine similarity of Hue-Saturation Histograms
  let dotHS = 0, mag1HS = 0, mag2HS = 0;
  for (let i = 0; i < 24; i++) {
    dotHS += f1.hsHist[i] * f2.hsHist[i];
    mag1HS += f1.hsHist[i] * f1.hsHist[i];
    mag2HS += f2.hsHist[i] * f2.hsHist[i];
  }
  const simHS = (mag1HS > 0 && mag2HS > 0)
    ? dotHS / (Math.sqrt(mag1HS) * Math.sqrt(mag2HS))
    : 0;

  // 3. Euclidean distance of 4x4 spatial color grid
  let distGrid = 0;
  for (let i = 0; i < 48; i++) {
    const diff = f1.grid[i] - f2.grid[i];
    distGrid += diff * diff;
  }
  const maxPossibleDist = Math.sqrt(48); // Maximum possible distance if opposite corners
  const simGrid = Math.max(0, 1 - Math.sqrt(distGrid) / maxPossibleDist);

  // 4. Average color proximity
  const rDiff = Math.abs(f1.avgR - f2.avgR) / 255;
  const gDiff = Math.abs(f1.avgG - f2.avgG) / 255;
  const bDiff = Math.abs(f1.avgB - f2.avgB) / 255;
  const simAvgColor = 1 - (rDiff + gDiff + bDiff) / 3;

  // Overall weighted score
  const score = (simRGB * 0.35) + (simHS * 0.35) + (simGrid * 0.15) + (simAvgColor * 0.15);
  return Math.min(1, Math.max(0, score));
};

/**
 * Load an image from a URL and extract its visual features
 */
export const extractFeaturesFromUrl = (url, timeoutMs = 4000) => {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return reject(new Error('Invalid image URL'));
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error('Image load timeout'));
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const features = extractImageFeatures(img, 64, 64);
        resolve(features);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      clearTimeout(timer);
      reject(err);
    };

    img.src = url;
  });
};
