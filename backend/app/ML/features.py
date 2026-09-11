from __future__ import annotations

from typing import Any

import pandas as pd


# ─── Constantes partagées entre training et inference ──────────────────────────
SEVERITY_ORDER = {
    "low": 0,
    "medium": 1,
    "high": 2,
    "critical": 3,
}


ALL_FEATURES = [
    "dept_id",
    "severity_encoded",
    "raised_by_role",
    "month",
    "quarter",
    "day_of_week",
    "is_weekend",
    "is_month_end",
]


# ─── Feature Engineering ─────────────────────────────────────────────────────
def build_features_for_inference(records: list[dict[str, Any]]) -> pd.DataFrame:
    if not records:
        return pd.DataFrame(columns=ALL_FEATURES)

    df = pd.DataFrame(records)

    # ─── Parsing temporel ──────────────────────────────────────────────────
    df["raised_at"] = pd.to_datetime(df["raised_at"], utc=True)

    # ─── Encodage severity (ordinal, fait côté Python) ───────────────────────
    df["severity"] = df["severity"].astype(str).str.lower().str.strip()
    df["severity_encoded"] = df["severity"].map(SEVERITY_ORDER)

    if df["severity_encoded"].isna().any():
        bad = df.loc[df["severity_encoded"].isna(), "severity"].unique().tolist()
        raise ValueError(
            f"severity inconnue(s) : {bad} -- attendu parmi {list(SEVERITY_ORDER.keys())}"
        )

    # ─── raised_by_role : passé BRUT au pipeline sklearn ─────────────────────
    df["raised_by_role"] = df["raised_by_role"].astype(str).str.strip()

    # ─── dept_id : passé BRUT au pipeline sklearn ────────────────────────────
    df["dept_id"] = df["dept_id"].astype(str).str.strip()

    # ─── Features temporelles (doivent matcher EXACTEMENT le notebook) ─────
    df["month"] = df["raised_at"].dt.month
    df["quarter"] = df["raised_at"].dt.quarter
    df["day_of_week"] = df["raised_at"].dt.dayofweek  # 0=Lundi
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["is_month_end"] = df["raised_at"].dt.is_month_end.astype(int)

    # ─── Vérification de cohérence ─────────────────────────────────────────
    missing_cols = set(ALL_FEATURES) - set(df.columns)
    if missing_cols:
        raise ValueError(f"Colonnes manquantes pour l'inference : {missing_cols}")

    return df[ALL_FEATURES].copy()


# ─── Utilitaires de validation ───────────────────────────────────────────────
def validate_against_training(
    inference_df: pd.DataFrame, training_feature_names: list[str] | pd.Index
) -> None:
    train_cols = list(training_feature_names)
    infer_cols = list(inference_df.columns)

    if train_cols != infer_cols:
        diff_train = set(train_cols) - set(infer_cols)
        diff_infer = set(infer_cols) - set(train_cols)
        raise ValueError(
            f"Dérive train/inference détectée !\n"
            f"  Dans train mais pas inference : {diff_train}\n"
            f"  Dans inference mais pas train : {diff_infer}"
        )