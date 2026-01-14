import Publisher from "../models/publisher.model.js";
import { appError } from "../utils/appError.js";

export async function getAllPublishersService() {
  return Publisher.findAll({ order: [["created_at", "DESC"]] });
}

export async function getPublisherByIdService(publisherId) {
  return Publisher.findByPk(publisherId);
}

export async function createPublisherService({ name }) {
  if (!name || String(name).trim() === "") {
    throw appError("Tên nhà xuất bản là bắt buộc", 400);
  }

  const trimmed = String(name).trim();
  const existed = await Publisher.findOne({ where: { name: trimmed } });
  if (existed) throw appError("Tên nhà xuất bản đã tồn tại", 400);

  return Publisher.create({ name: trimmed });
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
