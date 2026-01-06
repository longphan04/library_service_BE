import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class AuthToken extends Model {}

AuthToken.init(
  {
    token_id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    purpose: {
      type: DataTypes.ENUM('VERIFY_EMAIL','RESET_PASSWORD'),
      allowNull: false,
      defaultValue: 'RESET_PASSWORD',
    },
    token_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true, // DB tự default CURRENT_TIMESTAMP
    },
  },
  {
    sequelize,
    modelName: "AuthToken",
    tableName: "auth_tokens",
    timestamps: false,
  }
);

export default AuthToken;