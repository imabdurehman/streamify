import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    // upload file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });

    // console.log("File is uploaded on cloudinary ", response.secure_url);
    return response;
  } catch (error) {
    console.log("Cloudinary upload failed:", error);
    return null;
  }
};

const deleteOnCloudinary = async (publicId, resourceType = "image") => {
  try {
    if (!publicId) return;

    // delete file from cloudinary
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    console.error("Cloudinary deletion failed:", error);
    throw error;
  }
};

export { uploadOnCloudinary, deleteOnCloudinary };
