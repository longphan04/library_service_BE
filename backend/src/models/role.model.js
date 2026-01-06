import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class Role extends Model {}

Role.init(
  {
    role_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.ENUM("ADMIN", "STAFF", "MEMBER"),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true, // DB tự default CURRENT_TIMESTAMP
    },
  },
  {
    sequelize,
    modelName: "Role",
    tableName: "roles",
    timestamps: false, // bảng này chỉ có created_at, không có updated_at
  }
);

export default Role;
