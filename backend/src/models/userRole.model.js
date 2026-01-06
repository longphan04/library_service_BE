import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class UserRole extends Model {}

UserRole.init(
  {
    user_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      allowNull: false,
    },
    role_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true, // DB tự default CURRENT_TIMESTAMP
    },
  },
  {
    sequelize,
    modelName: "UserRole",
    tableName: "user_roles",
    timestamps: false,
  }
);

export default UserRole;
