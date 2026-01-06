import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class BookCopy extends Model {}

BookCopy.init(
  {
    copy_id: { 
        type: DataTypes.BIGINT, 
        autoIncrement: true, 
        primaryKey: true 
    },
    book_id: { 
        type: DataTypes.BIGINT, 
        allowNull: false 
    },
    barcode: { 
        type: DataTypes.STRING(64), 
        allowNull: false, 
        unique: true 
    },

    status: {
      type: DataTypes.ENUM("AVAILABLE", "HELD", "BORROWED", "REMOVED"),
      allowNull: false,
      defaultValue: "AVAILABLE",
    },

    acquired_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
    note: { 
        type: DataTypes.STRING(255), 
        allowNull: true 
    },
    created_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    }, // DB default CURRENT_TIMESTAMP
  },
  {
    sequelize,
    modelName: "BookCopy",
    tableName: "book_copies",
    timestamps: false,
  }
);

export default BookCopy;
