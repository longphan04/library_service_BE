import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class BookAuthor extends Model {}

BookAuthor.init(
  {
    book_id: { 
        type: DataTypes.BIGINT, 
        primaryKey: true, 
        allowNull: false 
    },
    author_id: { 
        type: DataTypes.BIGINT, 
        primaryKey: true, 
        allowNull: false 
    },
  },
  {
    sequelize,
    modelName: "BookAuthor",
    tableName: "book_authors",
    timestamps: false,
  }
);

export default BookAuthor;
