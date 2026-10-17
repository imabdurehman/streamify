import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: DB_NAME,
    });
    console.log(
      `MONGODB CONNECTED! Host Name: ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("MONGODB CONNECTION FAILED:", error.message);
    process.exit(1);
  }
};

export default connectDB;
