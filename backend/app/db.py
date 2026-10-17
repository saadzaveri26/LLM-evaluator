from collections.abc import AsyncIterator

import aiosqlite

from app.config import settings


async def init_db() -> None:
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            """
            create table if not exists runs (
                id text primary key,
                created_at text,
                status text,
                phase text,
                config text
            )
            """
        )
        await db.execute(
            """
            create table if not exists prompts (
                id integer primary key autoincrement,
                run_id text,
                idx integer,
                text text,
                reference text
            )
            """
        )
        await db.execute(
            """
            create table if not exists responses (
                id integer primary key autoincrement,
                run_id text,
                prompt_id integer,
                model text,
                provider text,
                text text,
                ttft_ms real,
                total_ms real,
                tps real,
                out_tokens integer,
                error text
            )
            """
        )
        await db.execute(
            """
            create table if not exists model_stats (
                run_id text,
                model text,
                provider text,
                size_gb real,
                vram_gb real
            )
            """
        )
        await db.execute(
            """
            create table if not exists scores (
                id integer primary key autoincrement,
                run_id text,
                response_id integer,
                pass integer,
                overall integer,
                correctness integer,
                completeness integer,
                clarity integer,
                instruction_following integer,
                rationale text
            )
            """
        )
        await db.execute(
            """
            create table if not exists audits (
                run_id text primary key,
                body text
            )
            """
        )
        await db.commit()


async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    db = await aiosqlite.connect(settings.db_path)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
