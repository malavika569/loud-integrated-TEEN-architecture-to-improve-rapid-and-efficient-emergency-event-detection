import lmdb

env = lmdb.open(
    r"F:\sak informatics\codes\MREM\CSE-B\B3. Encrypted Digital Evidence Storage\data\evidence_db",
    readonly=True,
    lock=False,
    max_dbs=10
)

users_db = env.open_db(b"users")
with env.begin(db=users_db) as txn:
    for k, v in txn.cursor():
        print("USER KEY:", k)
        print("USER VALUE:", v)
        print("-" * 50)
