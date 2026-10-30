import fs from "fs/promises";

export const deleteLocalFile = async (filePath) => {
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to delete local file:", error);
    }
  }
};

export const deleteLocalFiles = async (files = []) => {
  await Promise.all(files.map((file) => deleteLocalFile(file?.path)));
};
