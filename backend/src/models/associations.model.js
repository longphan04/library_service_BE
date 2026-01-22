import User from "./user.model.js";
import Profile from "./profile.model.js";
import Role from "./role.model.js";
import UserRole from "./userRole.model.js";
import AuthToken from "./authToken.model.js";
import RefreshToken from "./refreshToken.model.js";
import Category from "./category.model.js";
import Author from "./author.model.js";
import Publisher from "./publisher.model.js";
import Shelf from "./shelf.model.js";
import Book from "./book.model.js";
import BookCategory from "./bookCategory.model.js";
import BookAuthor from "./bookAuthor.model.js";
import BookCopy from "./bookCopy.model.js";
import BookHold from "./bookHold.model.js";
import BorrowTicket from "./borrowTicket.model.js";
import BorrowItem from "./borrowItem.model.js";
import TicketFine from "./ticketFine.model.js";
import Notification from "./notification.model.js";

export function applyAllAssociations() {
  // ===== AUTH =====
  User.hasOne(Profile, { foreignKey: "user_id", as: "profile" });
  Profile.belongsTo(User, { foreignKey: "user_id", as: "user" });

  User.belongsToMany(Role, {
    through: UserRole,
    foreignKey: "user_id",
    otherKey: "role_id",
    as: "roles",
  });
  Role.belongsToMany(User, {
    through: UserRole,
    foreignKey: "role_id",
    otherKey: "user_id",
    as: "users",
  });

  User.hasMany(AuthToken, { foreignKey: "user_id", as: "authTokens" });
  AuthToken.belongsTo(User, { foreignKey: "user_id", as: "user" });

  User.hasMany(RefreshToken, { foreignKey: "user_id", as: "refreshTokens" });
  RefreshToken.belongsTo(User, { foreignKey: "user_id", as: "user" });

  // ===== CATALOG =====
  Shelf.hasMany(Book, { foreignKey: "shelf_id", as: "books" });
  Book.belongsTo(Shelf, { foreignKey: "shelf_id", as: "shelf" });

  Publisher.hasMany(Book, { foreignKey: "publisher_id", as: "books" });
  Book.belongsTo(Publisher, { foreignKey: "publisher_id", as: "publisher" });

  // created_by / updated_by
  User.hasMany(Book, { foreignKey: "created_by", as: "createdBooks" });
  User.hasMany(Book, { foreignKey: "updated_by", as: "updatedBooks" });
  Book.belongsTo(User, { foreignKey: "created_by", as: "creator" });
  Book.belongsTo(User, { foreignKey: "updated_by", as: "updater" });

  // copies
  Book.hasMany(BookCopy, { foreignKey: "book_id", as: "copies" });
  BookCopy.belongsTo(Book, { foreignKey: "book_id", as: "book" });

  // N-N book_categories
  Book.belongsToMany(Category, {
    through: BookCategory,
    foreignKey: "book_id",
    otherKey: "category_id",
    as: "categories",
  });
  Category.belongsToMany(Book, {
    through: BookCategory,
    foreignKey: "category_id",
    otherKey: "book_id",
    as: "books",
  });

  // N-N book_authors
  Book.belongsToMany(Author, {
    through: BookAuthor,
    foreignKey: "book_id",
    otherKey: "author_id",
    as: "authors",
  });
  Author.belongsToMany(Book, {
    through: BookAuthor,
    foreignKey: "author_id",
    otherKey: "book_id",
    as: "books",
  });

  // ===== HOLDS =====
  User.hasMany(BookHold, { foreignKey: "member_id", as: "holds" });
  BookHold.belongsTo(User, { foreignKey: "member_id", as: "member" });

  BookCopy.hasOne(BookHold, { foreignKey: "copy_id", as: "hold" });
  BookHold.belongsTo(BookCopy, { foreignKey: "copy_id", as: "copy" });

  // ===== BORROW =====
  User.hasMany(BorrowTicket, { foreignKey: "member_id", as: "borrowTickets" });
  BorrowTicket.belongsTo(User, { foreignKey: "member_id", as: "member" });

  User.hasMany(BorrowTicket, { foreignKey: "approved_by", as: "approvedTickets" });
  BorrowTicket.belongsTo(User, { foreignKey: "approved_by", as: "approver" });

  User.hasMany(BorrowTicket, { foreignKey: "picked_up_by", as: "pickedTickets" });
  BorrowTicket.belongsTo(User, { foreignKey: "picked_up_by", as: "picker" });

  BorrowTicket.hasMany(BorrowItem, { foreignKey: "ticket_id", as: "items" });
  BorrowItem.belongsTo(BorrowTicket, { foreignKey: "ticket_id", as: "ticket" });

  BookCopy.hasMany(BorrowItem, { foreignKey: "copy_id", as: "borrowItems" });
  BorrowItem.belongsTo(BookCopy, { foreignKey: "copy_id", as: "copy" });

  Book.hasMany(BorrowItem, { foreignKey: "book_id", as: "borrowItems" });
  BorrowItem.belongsTo(Book, { foreignKey: "book_id", as: "book" });

  User.hasMany(BorrowItem, { foreignKey: "returned_by", as: "returnedItems" });
  BorrowItem.belongsTo(User, { foreignKey: "returned_by", as: "returnedBy" });

  // ===== FINES =====
  BorrowTicket.hasOne(TicketFine, { foreignKey: "ticket_id", as: "fine" });
  TicketFine.belongsTo(BorrowTicket, { foreignKey: "ticket_id", as: "ticket" });

  User.hasMany(TicketFine, { foreignKey: "member_id", as: "fines" });
  TicketFine.belongsTo(User, { foreignKey: "member_id", as: "member" });

  // ===== NOTIFICATIONS =====
  User.hasMany(Notification, { foreignKey: "user_id", as: "notifications" });
  Notification.belongsTo(User, { foreignKey: "user_id", as: "user" });
}
