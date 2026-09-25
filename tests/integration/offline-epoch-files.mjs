const control = [
  "supabase/migrations/20260925185000_native_household_write_barrier.sql",
  "supabase/migrations/20260925202107_native_offline_cutover_epoch.sql",
];

export const choreEpochFiles = [
  ...control,
  "supabase/migrations/20260925202807_native_chore_epoch_command.sql",
  "supabase/migrations/20260925204211_native_chore_epoch_snapshot.sql",
];

export const groceryEpochFiles = [
  ...control,
  "supabase/migrations/20260925202540_native_grocery_epoch_command.sql",
  "supabase/migrations/20260925203217_native_offline_epoch_snapshots.sql",
];
