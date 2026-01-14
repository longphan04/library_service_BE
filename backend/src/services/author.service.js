import Author from "../models/author.model.js";
import { appError } from "../utils/appError.js";

export async function getAllAuthorsService() {
  // chỉ lấy tên tác giả
  return Author.findAll({
    attributes: ["author_id", "name"],
    order: [["name", "ASC"]],
  });
}

export async function getAuthorByIdService(authorId) {
  return Author.findByPk(authorId);
}

export async function createAuthorService({ name, bio }, t = null) {
  if (!name || String(name).trim() === "") {
    throw appError("Tên tác giả là bắt buộc", 400);
  }

  const normalized = String(name).trim();
  const existingAuthor = await Author.findOne({
    where: { name: normalized },
    ...(t ? { transaction: t } : {}),
  });

  // Nếu đã có thì trả về luôn (id để gán vào book) thay vì throw,
  // giúp flow "name => create or reuse" gọn và tránh race.
  if (existingAuthor) return existingAuthor;

  const author = await Author.create(
    {
      name: normalized,
      bio: bio ?? null,
    },
    t ? { transaction: t } : undefined
  );

  return author;
}

export async function updateAuthorService(authorId, { name, bio }) {
  const author = await Author.findByPk(authorId);
  if (!author) return null;

  if (name !== undefined && String(name).trim() === "") {
    throw appError("Tên tác giả không được để trống", 400);
  }
  // Nếu đổi tên → check trùng
  if (name && String(name).trim() !== author.name) {
    const normalized = String(name).trim();

    const existingAuthor = await Author.findOne({
      where: { name: normalized },
    });

    if (existingAuthor) {
      throw appError("Tên tác giả đã tồn tại", 400);
    }
  }

  await author.update({
    name: name !== undefined ? String(name).trim() : author.name,
    bio: bio !== undefined ? bio : author.bio,
  });

  return author;
}

export async function deleteAuthorService(authorId) {
  const author = await Author.findByPk(authorId);
  if (!author) return false;

  // Nếu author đang được gán cho book thì DB sẽ RESTRICT, lỗi sẽ được middleware trả về.
  await author.destroy();
  return true;
}
