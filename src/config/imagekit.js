export const uploadToImageKit = async (file) => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileName", `${Date.now()}-${file.name}`);
    formData.append("publicKey", import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY);
    formData.append("folder", "/items");

    console.log("Uploading to ImageKit via API...");
    const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(import.meta.env.VITE_IMAGEKIT_PRIVATE_KEY + ":"),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Upload failed");
    }

    const result = await response.json();
    return result.url;
  } catch (error) {
    console.error("ImageKit Upload Error:", error);
    throw error;
  }
};

export default uploadToImageKit;

