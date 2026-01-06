import app from "./src/app.js";
import "dotenv/config";
import sequelize from "./src/config/dbConnection.js";
import { applyAllAssociations } from "./src/models/associations.model.js";

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    applyAllAssociations(); // <-- đặt ở đây (1 lần)
    await sequelize.authenticate();
    console.log("Connected database success");
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.log("Connected fail", error);
    process.exit(1);
  }

}
main();