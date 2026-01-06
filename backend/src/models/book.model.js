import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class Book extends Model {}

Book.init(
  {
    book_id: { 
        type: DataTypes.BIGINT, 
        autoIncrement: true, 
        primaryKey: true 
    },
    isbn: { 
        type: DataTypes.STRING(20), 
        allowNull: false, 
        unique: true 
    },
    title: { 
        type: DataTypes.STRING(255), 
        allowNull: false 
    },
    description: { 
        type: DataTypes.TEXT, 
        allowNull: true 
    },
    publish_year: { 
        type: DataTypes.INTEGER, 
        allowNull: true 
    },
    language: { 
        type: DataTypes.STRING(50), 
        allowNull: true 
    },

    cover_url: { 
        type: DataTypes.STRING(255), 
        allowNull: true 
    },
    publisher_id: { 
        type: DataTypes.INTEGER, 
        allowNull: true 
    },
    shelf_id: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },

    status: {
      type: DataTypes.ENUM("ACTIVE", "ARCHIVED"),
      allowNull: false,
      defaultValue: "ACTIVE",
    },

    created_by: { 
        type: DataTypes.BIGINT, 
        allowNull: true 
    },
    updated_by: { 
        type: DataTypes.BIGINT, 
        allowNull: true 
    },

    total_copies: { 
        type: DataTypes.INTEGER, 
        allowNull: false, 
        defaultValue: 0 
    },
    available_copies: { 
        type: DataTypes.INTEGER, 
        allowNull: false, 
        defaultValue: 0 
    },
  },
  {
    sequelize,
    modelName: "Book",
    tableName: "books",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Book;
