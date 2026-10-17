import "dotenv/config";
import connectDB from "./db/configDB.js";
import { app } from "./app.js";

// dotenv.config({ path: "./.env" });

connectDB()
  .then(() => {
    app.listen(process.env.PORT || 8000, () => {
      console.log(`Server is running at port: ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.log("Mongo db connection failed!", err);
  });
