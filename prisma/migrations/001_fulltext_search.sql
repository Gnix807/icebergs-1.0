-- prisma/migrations/001_fulltext_search.sql
-- PostgreSQL 原生全文搜索：tsvector 列 + GIN 索引 + 自动更新触发器
-- 支持中英文混合搜索（中文按字拆分 + 英文按词）

-- 0. 清理旧触发器避免冲突
DROP TRIGGER IF EXISTS trg_iceberg_search_vector ON icebergs;
DROP FUNCTION IF EXISTS update_iceberg_search_vector();

-- 1. 添加 search_vector 列
ALTER TABLE icebergs ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- 兼容旧版本曾被 Prisma db push 误建为 TEXT 的数据库。
-- 先移除依赖旧类型的索引，再无损转回 TSVECTOR；下方会根据标题和简介重建内容。
DO $$
DECLARE
    current_udt TEXT;
BEGIN
    SELECT c.udt_name INTO current_udt
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'icebergs'
      AND c.column_name = 'search_vector';

    IF current_udt IS DISTINCT FROM 'tsvector' THEN
        DROP INDEX IF EXISTS idx_icebergs_search;
        ALTER TABLE icebergs
          ALTER COLUMN search_vector TYPE TSVECTOR
          USING NULL::TSVECTOR;
    END IF;
END
$$;

-- 2. GIN 索引
CREATE INDEX IF NOT EXISTS idx_icebergs_search ON icebergs USING GIN(search_vector);

-- 3. 辅助函数：将文本转为可搜索的 tsvector
--    中文按字拆分并保留原词，英文按词拆分
CREATE OR REPLACE FUNCTION to_search_vector(text TEXT) RETURNS TSVECTOR AS $$
DECLARE
    chars TEXT;
    result TEXT;
BEGIN
    IF text IS NULL OR trim(text) = '' THEN
        RETURN ''::TSVECTOR;
    END IF;

    -- 将每个 CJK 字符单独拆出，与原文合并
    SELECT string_agg(ch, ' ') INTO chars
    FROM (SELECT regexp_split_to_table(text, '')) AS t(ch)
    WHERE ch ~ '[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]';

    IF chars IS NOT NULL THEN
        result := chars || ' ' || text;
    ELSE
        result := text;
    END IF;

    RETURN to_tsvector('simple', lower(result));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. 自动更新触发器
CREATE OR REPLACE FUNCTION update_iceberg_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_search_vector(COALESCE(NEW.title, '')), 'A') ||
        setweight(to_search_vector(COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_iceberg_search_vector
    BEFORE INSERT OR UPDATE OF title, description ON icebergs
    FOR EACH ROW EXECUTE FUNCTION update_iceberg_search_vector();

-- 5. 只初始化新列或类型修复后尚未生成索引的数据，避免每次部署重写全表。
UPDATE icebergs SET search_vector =
    setweight(to_search_vector(COALESCE(title, '')), 'A') ||
    setweight(to_search_vector(COALESCE(description, '')), 'B')
WHERE search_vector IS NULL;
