import Shelf from "../models/shelf.model.js";
import { appError } from "../utils/appError.js";



// lay tat ca shelf
export async function getAllShelvesService() {
  // không lấy trường name
  return Shelf.findAll({ order: [["shelf_id", "ASC"]], attributes: { exclude: ["name"] } });
}

// lay shelf theo ID
export async function getShelfByIdService(shelfId) {
  return Shelf.findByPk(shelfId);
}

// tao shelf moi
export async function createShelfService({ code, name }) {
  if (!code || String(code).trim() === "") {
    throw appError("Mã kệ (code) là bắt buộc", 400);
  }

  const trimmed = String(code).trim();
  const existed = await Shelf.findOne({ where: { code: trimmed } });
  if (existed) throw appError("Mã kệ đã tồn tại", 400);

  return Shelf.create({
    code: trimmed,
    name: name ?? null,
  });
}

// cap nhat shelf
export async function updateShelfService(shelfId, { code, name }) {
  const shelf = await Shelf.findByPk(shelfId);
  if (!shelf) return null;

  if (code !== undefined && String(code).trim() === "") {
    throw appError("Mã kệ (code) không được để trống", 400);
  }

  if (code !== undefined) {
    const trimmed = String(code).trim();
    if (trimmed !== shelf.code) {
      const existed = await Shelf.findOne({ where: { code: trimmed } });
      if (existed) throw appError("Mã kệ đã tồn tại", 400);
    }
  }

  await shelf.update({
    code: code !== undefined ? String(code).trim() : shelf.code,
    name: name !== undefined ? name : shelf.name,
  });

  return shelf;
}

// xoa shelf
export async function deleteShelfService(shelfId) {
  const shelf = await Shelf.findByPk(shelfId);
  if (!shelf) return false;

  // Nếu shelf đang được gán cho book thì DB sẽ RESTRICT
  await shelf.destroy();
  return true;
}
