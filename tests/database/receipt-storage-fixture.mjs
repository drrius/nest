import { fixture as money, id, as, correct, replacement } from "./money-correction-fixture.mjs";
import { expense } from "./money-expense-helpers.mjs";
export { id, as, correct, replacement };
export function fixture(t) {
  const f = money(t);
  f.db.file("tests/database/receipt-storage-fixture.sql");
  f.db.file("tests/database/legacy-money/receipt-attachments.sql");
  const path = (n, home = 10) => `${id(home)}/receipts/${id(n)}.jpg`;
  const reserve = (target) =>
    `select public.reserve_household_attachment('${target}','image/jpeg')`;
  const upload = (target, mime = "image/jpeg") =>
    `insert into storage.objects(bucket_id,name,metadata) values ('household-files','${target}','${JSON.stringify({ mimetype: mime, size: 128 })}')`;
  const cleanup = (target) =>
    `select * from public.begin_household_attachment_cleanup('${target}')`;
  const finish = (target) => `select public.finish_household_attachment_cleanup('${target}')`;
  const save = (target, key) =>
    expense(key).replace("'Retained note',null)", `'Retained note','${target}')`);
  const seed = (target) => {
    f.db.sql(as(1, reserve(target)));
    f.db.sql(upload(target));
  };
  const state = (target) =>
    f.db.sql(`select state from public.household_attachment_uploads where path='${target}'`);
  return { ...f, path, reserve, upload, cleanup, finish, save, seed, state };
}
