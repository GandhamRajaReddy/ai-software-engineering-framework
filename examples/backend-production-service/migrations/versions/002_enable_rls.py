"""Enable PostgreSQL Row-Level Security (RLS) on tenant tables

Revision ID: 002_enable_rls
Revises: 001_initial_schema
Create Date: 2026-11-15 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '002_enable_rls'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Dialect-safe RLS activation: only executes on PostgreSQL
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        # Enable RLS and force it even for table owners
        op.execute("ALTER TABLE items ENABLE ROW LEVEL SECURITY;")
        op.execute("ALTER TABLE items FORCE ROW LEVEL SECURITY;")
        
        # Policy binds item tenant_id to PostgreSQL session variable 'app.current_tenant_id'
        op.execute("""
            CREATE POLICY tenant_isolation_policy ON items
            FOR ALL
            USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''))
            WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''));
        """)

def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        op.execute("DROP POLICY IF EXISTS tenant_isolation_policy ON items;")
        op.execute("ALTER TABLE items DISABLE ROW LEVEL SECURITY;")
