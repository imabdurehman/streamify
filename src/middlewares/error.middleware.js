import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
  const statusCode = err instanceof ApiError ? err.statusCode : 500;

  const message =
    err instanceof ApiError ? err.message : "Internal Server Error";

  console.error(err.stack || err);

  return res.status(statusCode).json({
    statusCode,
    data: null,
    message,
    success: false,
    errors: err instanceof ApiError ? err.errors : [],
  });
};

export { errorHandler };
