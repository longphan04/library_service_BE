import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class TicketFine extends Model {}

TicketFine.init(
  {
    fine_id: { 
        type: DataTypes.BIGINT, 
        autoIncrement: true, 
        primaryKey: true 
    },
    ticket_id: { 
        type: DataTypes.BIGINT, 
        allowNull: false, 
        unique: true 
    },
    member_id: { 
        type: DataTypes.BIGINT, 
        allowNull: false 
    },
    rate_per_day: { 
        type: DataTypes.INTEGER, 
        allowNull: false, 
        defaultValue: 3000 
    },
    days_overdue: { 
        type: DataTypes.INTEGER, 
        allowNull: false, 
        defaultValue: 0 
    },
    unreturned_count: { 
        type: DataTypes.INTEGER, 
        allowNull: false, 
        defaultValue: 0 
    },
    amount: { 
        type: DataTypes.INTEGER, 
        allowNull: false, 
        defaultValue: 0 
    },
    status: {
      type: DataTypes.ENUM("UNPAID", "PENDING", "PAID", "FAILED"),
      allowNull: false,
      defaultValue: "UNPAID",
    },
    app_trans_id: { 
        type: DataTypes.STRING(40), 
        allowNull: true, 
        unique: true 
    },
    zp_trans_id: { 
        type: DataTypes.STRING(64), 
        allowNull: true 
    },
    paid_at: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
  },
  {
    sequelize,
    modelName: "TicketFine",
    tableName: "ticket_fines",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default TicketFine;
