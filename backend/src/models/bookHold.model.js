import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class BookHold extends Model {}

BookHold.init(
  {
    hold_id: { 
        type: DataTypes.BIGINT, 
        autoIncrement: true, 
        primaryKey: true 
    },
    member_id: { 
        type: DataTypes.BIGINT, 
        allowNull: false 
    },
    copy_id: { 
        type: DataTypes.BIGINT, 
        allowNull: false 
    },

    expires_at: { 
        type: DataTypes.DATE, 
        allowNull: false 
    },
    created_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
  },
  {
    sequelize,
    modelName: "BookHold",
    tableName: "book_holds",
    timestamps: false,
  }
);

export default BookHold;
