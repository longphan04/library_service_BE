import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class BookImage extends Model {}

BookImage.init(
  {
    image_id: { 
        type: DataTypes.BIGINT, 
        autoIncrement: true, 
        primaryKey: true 
    },
    book_id: { 
        type: DataTypes.BIGINT, 
        allowNull: false 
    },
    image_url: { 
        type: DataTypes.STRING(255), 
        allowNull: false 
    },
    sort_order: { 
        type: DataTypes.INTEGER, 
        allowNull: false, 
        defaultValue: 0 
    },
    created_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
  },
  {
    sequelize,
    modelName: "BookImage",
    tableName: "book_images",
    timestamps: false,
  }
);

export default BookImage;
