import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class BorrowItem extends Model {}

BorrowItem.init(
  {
    borrow_item_id: { 
        type: DataTypes.BIGINT, 
        autoIncrement: true, 
        primaryKey: true 
    },
    ticket_id: { 
        type: DataTypes.BIGINT, 
        allowNull: false 
    },
    copy_id: { 
        type: DataTypes.BIGINT, 
        allowNull: false 
    },
    book_id: { 
        type: DataTypes.BIGINT, 
        allowNull: false 
    },
    returned_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
    returned_by: { 
        type: DataTypes.BIGINT, 
        allowNull: true 
    },
    status: {
      type: DataTypes.ENUM("BORROWED", "RETURNED", "REMOVED"),
      allowNull: false,
      defaultValue: "BORROWED",
    },
  },
  {
    sequelize,
    modelName: "BorrowItem",
    tableName: "borrow_items",
    timestamps: false,
  }
);

export default BorrowItem;
