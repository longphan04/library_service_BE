import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

/**
 * Model BookView - lưu lịch sử xem chi tiết sách của user
 * Dùng để gợi ý sách dựa trên hành vi xem
 */
export class BookView extends Model {}

BookView.init(
  {
    view_id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    book_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    viewed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "BookView",
    tableName: "book_views",
    timestamps: false, // chỉ dùng viewed_at, không cần created_at/updated_at
    indexes: [
      { fields: ["user_id"] },
      { fields: ["book_id"] },
      { fields: ["viewed_at"] },
    ],
  }
);

export default BookView;
