import Publisher from "../../models/publisher.model.js";
import { appError } from "../../utils/appError.js";

// Gợi ý nhà xuất bản theo tiền tố (prefix)
// - Chỉ lấy theo trường name
// - Mỗi lần lấy tối đa 10 kết quả
export async function suggestPublishersService({ keyword, limit = 10 } = {}) {
  const { Op } = await import("sequelize");

  const kw = String(keyword ?? "").trim();
  if (!kw) return { data: [] };

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);

  const rows = await Publisher.findAll({
    attributes: ["publisher_id", "name"],
    where: { name: { [Op.like]: `${kw}%` } },
    order: [["name", "ASC"]],
    limit: safeLimit,
    raw: true,
  });

  return { data: rows };
}

export async function getAllPublishersService() {
  return Publisher.findAll({
    attributes: ["publisher_id", "name"],
    order: [["name", "ASC"]],
  });
}

export async function getPublisherByIdService(publisherId) {
  return Publisher.findByPk(publisherId);
}

export async function createPublisherService({ name }, t = null) {
  if (!name || String(name).trim() === "") {
    throw appError("Tên nhà xuất bản là bắt buộc", 400);
  }

  const trimmed = String(name).trim();
  const existed = await Publisher.findOne({
    where: { name: trimmed },
    ...(t ? { transaction: t } : {}),
  });

  // Nếu đã có thì trả về luôn (id để gán vào book) thay vì throw,
  // giúp flow "name => create or reuse" gọn và tránh race.
  if (existed) return existed;

  return Publisher.create(
    { name: trimmed },
    t ? { transaction: t } : undefined
  );
}

export async function updatePublisherService(publisherId, { name }) {
  const publisher = await Publisher.findByPk(publisherId);
  if (!publisher) return null;

  if (name !== undefined && String(name).trim() === "") {
    throw appError("Tên nhà xuất bản không được để trống", 400);
  }

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (trimmed !== publisher.name) {
      const existed = await Publisher.findOne({ where: { name: trimmed } });
      if (existed) throw appError("Tên nhà xuất bản đã tồn tại", 400);
    }
  }

  await publisher.update({
    name: name !== undefined ? String(name).trim() : publisher.name,
  });

  return publisher;
}

export async function deletePublisherService(publisherId) {
  const publisher = await Publisher.findByPk(publisherId);
  if (!publisher) return false;

  // Nếu publisher đang được gán cho book thì DB sẽ SET NULL hoặc RESTRICT tùy schema.
  await publisher.destroy();
  return true;
}
