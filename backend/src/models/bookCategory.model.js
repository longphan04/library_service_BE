import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class BookCategory extends Model {}

BookCategory.init(
  {
    book_id: { 
        type: DataTypes.BIGINT, 
        primaryKey: true, 
        allowNull: false 
    },
    category_id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        allowNull: false 
    },
    created_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    }, // DB default CURRENT_TIMESTAMP
  },
  {
    sequelize,
    modelName: "BookCategory",
    tableName: "book_categories",
    timestamps: false,
  }
);

export default BookCategory;
