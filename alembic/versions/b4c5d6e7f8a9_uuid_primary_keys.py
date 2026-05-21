"""Migrate integer primary keys to UUID

Revision ID: b4c5d6e7f8a9
Revises: 3069ba39ebc3
Create Date: 2026-05-21

Strategy:
  1. Add _new_* UUID columns alongside existing integer columns
  2. Backfill UUID FKs by joining on the old integer IDs
  3. Swap constraints (drop old PKs/FKs, promote UUID columns)
  4. Drop old integer columns and rename UUID columns

Existing data is fully preserved. Auth JWTs use auth_id (username), not
the integer id, so no users need to re-authenticate.
"""

from alembic import op
import sqlalchemy as sa

revision: str = 'b4c5d6e7f8a9'
down_revision = '3069ba39ebc3'
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _exec(sql: str):
    op.execute(sa.text(sql))


def upgrade() -> None:
    # ── 0. Enable pgcrypto (gen_random_uuid for PG < 13) ───────────────────
    _exec('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    # ── 1. Add UUID columns ─────────────────────────────────────────────────
    _exec("ALTER TABLE users ADD COLUMN _new_id UUID NOT NULL DEFAULT gen_random_uuid()")

    _exec("ALTER TABLE liked_tracks ADD COLUMN _new_id UUID NOT NULL DEFAULT gen_random_uuid()")
    _exec("ALTER TABLE liked_tracks ADD COLUMN _new_user_id UUID")

    _exec("ALTER TABLE messages ADD COLUMN _new_id UUID NOT NULL DEFAULT gen_random_uuid()")
    _exec("ALTER TABLE messages ADD COLUMN _new_sender_id UUID")
    _exec("ALTER TABLE messages ADD COLUMN _new_recipient_id UUID")
    _exec("ALTER TABLE messages ADD COLUMN _new_reply_to_id UUID")

    # conversation_reads and app_settings may not exist in older deployments
    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_reads') THEN
                ALTER TABLE conversation_reads ADD COLUMN _new_user_id UUID;
                ALTER TABLE conversation_reads ADD COLUMN _new_partner_id UUID;
            END IF;
        END $$
    """)

    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
                ALTER TABLE app_settings ADD COLUMN _new_id UUID NOT NULL DEFAULT gen_random_uuid();
            END IF;
        END $$
    """)

    # ── 2. Backfill FK UUID columns via old integer joins ───────────────────
    _exec("UPDATE liked_tracks lt SET _new_user_id = u._new_id FROM users u WHERE u.id = lt.user_id")

    _exec("UPDATE messages m SET _new_sender_id    = u._new_id FROM users u WHERE u.id = m.sender_id")
    _exec("UPDATE messages m SET _new_recipient_id = u._new_id FROM users u WHERE u.id = m.recipient_id")
    # Self-referencing reply_to: all messages have _new_id already so this is safe
    _exec("""
        UPDATE messages m
           SET _new_reply_to_id = p._new_id
          FROM messages p
         WHERE m.reply_to_id IS NOT NULL AND p.id = m.reply_to_id
    """)

    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_reads') THEN
                UPDATE conversation_reads cr SET _new_user_id    = u._new_id FROM users u WHERE u.id = cr.user_id;
                UPDATE conversation_reads cr SET _new_partner_id = u._new_id FROM users u WHERE u.id = cr.partner_id;
            END IF;
        END $$
    """)

    # ── 3. Enforce NOT NULL on FK UUID columns ──────────────────────────────
    _exec("ALTER TABLE liked_tracks  ALTER COLUMN _new_user_id      SET NOT NULL")
    _exec("ALTER TABLE messages      ALTER COLUMN _new_sender_id    SET NOT NULL")
    _exec("ALTER TABLE messages      ALTER COLUMN _new_recipient_id SET NOT NULL")

    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_reads') THEN
                ALTER TABLE conversation_reads ALTER COLUMN _new_user_id    SET NOT NULL;
                ALTER TABLE conversation_reads ALTER COLUMN _new_partner_id SET NOT NULL;
            END IF;
        END $$
    """)

    # ── 4. Drop old FK + unique constraints ─────────────────────────────────
    # liked_tracks
    _exec("ALTER TABLE liked_tracks DROP CONSTRAINT IF EXISTS uq_user_track_like")
    _exec("ALTER TABLE liked_tracks DROP CONSTRAINT IF EXISTS liked_tracks_user_id_fkey")

    # messages — drop ALL FKs dynamically (reply_to FK has an auto-generated name)
    _exec("""
        DO $$
        DECLARE r record;
        BEGIN
            FOR r IN (
                SELECT conname FROM pg_constraint
                 WHERE conrelid = 'messages'::regclass
                   AND contype  = 'f'
            ) LOOP
                EXECUTE 'ALTER TABLE messages DROP CONSTRAINT ' || quote_ident(r.conname);
            END LOOP;
        END $$
    """)

    # conversation_reads
    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_reads') THEN
                ALTER TABLE conversation_reads DROP CONSTRAINT IF EXISTS conversation_reads_user_id_fkey;
                ALTER TABLE conversation_reads DROP CONSTRAINT IF EXISTS conversation_reads_partner_id_fkey;
                ALTER TABLE conversation_reads DROP CONSTRAINT IF EXISTS conversation_reads_pkey;
            END IF;
        END $$
    """)

    # ── 5. Drop old PKs ─────────────────────────────────────────────────────
    _exec("ALTER TABLE users         DROP CONSTRAINT users_pkey")
    _exec("ALTER TABLE liked_tracks  DROP CONSTRAINT liked_tracks_pkey")
    _exec("ALTER TABLE messages      DROP CONSTRAINT messages_pkey")
    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
                ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
            END IF;
        END $$
    """)

    # ── 6. Drop old integer columns (CASCADE removes dependent indexes) ──────
    _exec("ALTER TABLE users         DROP COLUMN id          CASCADE")
    _exec("ALTER TABLE liked_tracks  DROP COLUMN id          CASCADE")
    _exec("ALTER TABLE liked_tracks  DROP COLUMN user_id     CASCADE")
    _exec("ALTER TABLE messages      DROP COLUMN id          CASCADE")
    _exec("ALTER TABLE messages      DROP COLUMN sender_id   CASCADE")
    _exec("ALTER TABLE messages      DROP COLUMN recipient_id CASCADE")
    _exec("ALTER TABLE messages      DROP COLUMN reply_to_id CASCADE")

    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_reads') THEN
                ALTER TABLE conversation_reads DROP COLUMN user_id    CASCADE;
                ALTER TABLE conversation_reads DROP COLUMN partner_id CASCADE;
            END IF;
        END $$
    """)

    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
                ALTER TABLE app_settings DROP COLUMN id CASCADE;
            END IF;
        END $$
    """)

    # ── 7. Rename UUID columns to production names ──────────────────────────
    _exec("ALTER TABLE users        RENAME COLUMN _new_id            TO id")
    _exec("ALTER TABLE liked_tracks RENAME COLUMN _new_id            TO id")
    _exec("ALTER TABLE liked_tracks RENAME COLUMN _new_user_id       TO user_id")
    _exec("ALTER TABLE messages     RENAME COLUMN _new_id            TO id")
    _exec("ALTER TABLE messages     RENAME COLUMN _new_sender_id     TO sender_id")
    _exec("ALTER TABLE messages     RENAME COLUMN _new_recipient_id  TO recipient_id")
    _exec("ALTER TABLE messages     RENAME COLUMN _new_reply_to_id   TO reply_to_id")

    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_reads') THEN
                ALTER TABLE conversation_reads RENAME COLUMN _new_user_id    TO user_id;
                ALTER TABLE conversation_reads RENAME COLUMN _new_partner_id TO partner_id;
            END IF;
        END $$
    """)

    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
                ALTER TABLE app_settings RENAME COLUMN _new_id TO id;
            END IF;
        END $$
    """)

    # ── 8. Re-add primary keys ──────────────────────────────────────────────
    _exec("ALTER TABLE users        ADD CONSTRAINT users_pkey        PRIMARY KEY (id)")
    _exec("ALTER TABLE liked_tracks ADD CONSTRAINT liked_tracks_pkey PRIMARY KEY (id)")
    _exec("ALTER TABLE messages     ADD CONSTRAINT messages_pkey     PRIMARY KEY (id)")

    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_reads') THEN
                ALTER TABLE conversation_reads ADD PRIMARY KEY (user_id, partner_id);
            END IF;
        END $$
    """)

    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
                ALTER TABLE app_settings ADD PRIMARY KEY (id);
            END IF;
        END $$
    """)

    # ── 9. Re-add foreign keys ──────────────────────────────────────────────
    _exec("""
        ALTER TABLE liked_tracks
            ADD CONSTRAINT liked_tracks_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    """)
    _exec("""
        ALTER TABLE messages
            ADD CONSTRAINT messages_sender_id_fkey
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    """)
    _exec("""
        ALTER TABLE messages
            ADD CONSTRAINT messages_recipient_id_fkey
            FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    """)
    _exec("""
        ALTER TABLE messages
            ADD CONSTRAINT messages_reply_to_id_fkey
            FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
    """)

    _exec("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_reads') THEN
                ALTER TABLE conversation_reads
                    ADD CONSTRAINT conversation_reads_user_id_fkey
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
                ALTER TABLE conversation_reads
                    ADD CONSTRAINT conversation_reads_partner_id_fkey
                    FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE;
            END IF;
        END $$
    """)

    # ── 10. Recreate unique constraint and indexes ──────────────────────────
    _exec("ALTER TABLE liked_tracks ADD CONSTRAINT uq_user_track_like UNIQUE (user_id, track_id)")

    _exec("CREATE INDEX IF NOT EXISTS ix_liked_tracks_user_id   ON liked_tracks(user_id)")
    _exec("CREATE INDEX IF NOT EXISTS ix_liked_tracks_track_id  ON liked_tracks(track_id)")
    _exec("CREATE INDEX IF NOT EXISTS ix_messages_sender_id     ON messages(sender_id)")
    _exec("CREATE INDEX IF NOT EXISTS ix_messages_recipient_id  ON messages(recipient_id)")
    _exec("CREATE INDEX IF NOT EXISTS ix_messages_reply_to_id   ON messages(reply_to_id)")


def downgrade() -> None:
    raise NotImplementedError(
        "Downgrade from UUID PKs to integer PKs is not supported. "
        "Restore from a pre-migration database backup."
    )
