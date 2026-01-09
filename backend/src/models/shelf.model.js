import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class Shelf extends Model {}

Shelf.init(
  {
    shelf_id: { 
        type: DataTypes.INTEGER, 
        autoIncrement: true, 
        primaryKey: true 
    },
    code: { 
        type: DataTypes.STRING(40), 
        allowNull: false, 
        unique: true 
    },
    name: { 
        type: DataTypes.STRING(120), 
        allowNull: true 
    },
    created_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    }, // DB default CURRENT_TIMESTAMP
  },
  {
    sequelize,
    modelName: "Shelf",
    tableName: "shelves",
    timestamps: false,
  }
);

export default Shelf;
