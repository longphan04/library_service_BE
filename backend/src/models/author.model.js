import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class Author extends Model {}

Author.init(
  {
    author_id: { 
        type: DataTypes.BIGINT, 
        autoIncrement: true, primaryKey: true 
    },
    name: { 
        type: DataTypes.STRING(120), 
        allowNull: false 
    },
    bio: { 
        type: DataTypes.TEXT, 
        allowNull: true 
    },
    created_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    }, // DB default CURRENT_TIMESTAMP
  },
  {
    sequelize,
    modelName: "Author",
    tableName: "authors",
    timestamps: false,
  }
);

export default Author;
