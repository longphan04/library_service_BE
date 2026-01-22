import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class Notification extends Model {}

Notification.init(
  {
    notification_id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM(
        "BORROW_CREATED",
        "BORROW_APPROVED",
        "BORROW_PICKED_UP",
        "BORROW_RETURNED",
        "BORROW_CANCELLED",
        "BORROW_OVERDUE"
      ),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reference_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: "Notification",
    tableName: "notifications",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false, // không cần updated_at
  }
);

export default Notification;
