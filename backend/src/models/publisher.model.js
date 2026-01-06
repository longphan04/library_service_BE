import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class Publisher extends Model {}

Publisher.init(
  {
    publisher_id: { 
        type: DataTypes.INTEGER, 
        autoIncrement: true, 
        primaryKey: true 
    },
    name: { 
        type: DataTypes.STRING(150), 
        allowNull: false, 
        unique: true 
    },
    created_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    }, // DB default CURRENT_TIMESTAMP
  },
  {
    sequelize,
    modelName: "Publisher",
    tableName: "publishers",
    timestamps: false,
  }
);

export default Publisher;
