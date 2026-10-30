import multer from "multer";
import crypto from "crypto";
import path from "path";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/temp");
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || ""; // get .png, .jpg, .mp4, etc

    crypto.randomBytes(16, function (err, raw) {
      if (err) return cb(err);

      cb(null, file.fieldname + "-" + raw.toString("hex") + ext);
    });
  },
});

export const upload = multer({
  storage,
});
