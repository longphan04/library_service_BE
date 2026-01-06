import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class BorrowTicket extends Model {}

BorrowTicket.init(
  {
    ticket_id: { 
        type: DataTypes.BIGINT, 
        autoIncrement: true, 
        primaryKey: true 
    },
    ticket_code: { 
        type: DataTypes.STRING(30), 
        allowNull: false, 
        unique: true 
    },
    member_id: { 
        type: DataTypes.BIGINT, 
        allowNull: false 
    },
    status: {
      type: DataTypes.ENUM("PENDING", "APPROVED", "PICKED_UP", "RETURNED", "CANCELLED"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    requested_at: { 
        type: DataTypes.DATE, 
        allowNull: false 
    },
    approved_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
    approved_by: { 
        type: DataTypes.BIGINT, 
        allowNull: true 
    },
    pickup_expires_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
    picked_up_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
    picked_up_by: { 
        type: DataTypes.BIGINT, 
        allowNull: true 
    },
    due_date: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
    renew_count: { 
        type: DataTypes.TINYINT, 
        allowNull: false, 
        defaultValue: 0 
    },
  },
  {
    sequelize,
    modelName: "BorrowTicket",
    tableName: "borrow_tickets",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default BorrowTicket;
