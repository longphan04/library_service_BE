import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class Category extends Model {}

Category.init(
  {
    category_id: { 
        type: DataTypes.INTEGER, 
        autoIncrement: true, 
        primaryKey: true 
    },
    name: { 
        type: DataTypes.STRING(120), 
        allowNull: false, 
        unique: true 
    },
    image: { 
        type: DataTypes.STRING(255), 
        allowNull: true 
    },
  },
  {
    sequelize,
    modelName: "Category",
    tableName: "categories",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Category;
