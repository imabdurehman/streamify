import { deleteLocalFiles } from "../utils/fileCleanup.js";

export const withFileCleanup = (controller) => {
  return async (req, res, next) => {
    try {
      await controller(req, res, next);
    } finally {
      const files = Object.values(req.files || {}).flat();

      if (req.file) {
        files.push(req.file);
      }

      await deleteLocalFiles(files);
    }
  };
};
