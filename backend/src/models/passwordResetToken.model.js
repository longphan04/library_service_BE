import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class PasswordResetToken extends Model {}

PasswordResetToken.init(
  {
    prt_id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    token_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
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
    modelName: "PasswordResetToken",
    tableName: "password_reset_tokens",
    timestamps: false,
  }
);

export default PasswordResetToken;
