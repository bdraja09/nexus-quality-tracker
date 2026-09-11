import logging
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from app.ML.features import build_features_for_inference, ALL_FEATURES, validate_against_training

import joblib
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ─── Configuration ─────────────────────────────────────────────────────────────
_DEFAULT_MODEL_PATH = (
    Path(__file__).resolve().parent.parent
    / "ML"
    / "delay_risk_best_model.joblib"
)
MODEL_PATH = Path(os.getenv("DELAY_RISK_MODEL_PATH", _DEFAULT_MODEL_PATH))


class DelayRiskService:
    """
    Singleton de prédiction du risque de délai (ISO 10.2).
    Charge le .joblib une seule fois, de manière LAZY (à la première prédiction)
    ou au boot si le fichier est présent. Le backend démarre même sans modèle.
    """

    _instance: Optional["DelayRiskService"] = None
    _lock = threading.Lock()

    def __new__(cls, *args: Any, **kwargs: Any) -> "DelayRiskService":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, model_path: Optional[Path] = None) -> None:
        if getattr(self, "_initialized", False):
            return

        self.model_path = model_path or MODEL_PATH

        self._model: Any = None
        self._threshold: float = 0.5
        self._preprocessor: Any = None
        self._feature_names: Optional[list[str]] = None
        self._metadata: Dict[str, Any] = {}
        self._load_error: Optional[str] = None  # ← stocke l'erreur si chargement échoue

        # Chargement lazy : on essaie au boot, mais on ne plante jamais
        try:
            self._load_model()
        except FileNotFoundError as exc:
            self._load_error = str(exc)
            logger.warning(
                "DelayRiskService démarré SANS modèle (%s). "
                "Placez le .joblib dans ML/ et redémarrez pour activer les prédictions.",
                self.model_path,
            )
        except Exception as exc:
            self._load_error = str(exc)
            logger.error("DelayRiskService : échec chargement modèle : %s", exc)

        self._initialized = True
        logger.info("DelayRiskService initialisé | path=%s", self.model_path)

    # ─── Chargement du modèle ──────────────────────────────────────────────────
    def _load_model(self) -> None:
        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Modèle non trouvé : {self.model_path}. "
                "Placez le .joblib dans ML/ ou définissez DELAY_RISK_MODEL_PATH."
            )

        try:
            artifact = joblib.load(self.model_path)
        except Exception as exc:
            logger.exception("Échec chargement joblib")
            raise RuntimeError(f"Impossible de charger le modèle : {exc}") from exc

        if isinstance(artifact, dict):
            self._model = (
                artifact.get("model")
                or artifact.get("classifier")
                or artifact.get("estimator")
            )
            self._threshold = float(artifact.get("threshold", 0.5))
            self._preprocessor = (
                artifact.get("preprocessor")
                or artifact.get("encoder")
                or artifact.get("pipeline")
            )
            self._feature_names = artifact.get("feature_names")
            self._metadata = {
                k: v
                for k, v in artifact.items()
                if k not in {
                    "model", "classifier", "estimator",
                    "threshold", "preprocessor", "encoder", "pipeline",
                    "feature_names",
                }
            }
        else:
            self._model = artifact

        if self._model is None:
            raise ValueError("Aucun modèle valide trouvé dans l'artefact .joblib")

        # ─── Validation anti-dérive ──────────────────────────────────────────
        dummy_df = build_features_for_inference([{
            "dept_id": "D01",
            "severity": "medium",
            "raised_by_role": "Operator",
            "raised_at": "2026-01-15T09:00:00+00:00",
        }])

        train_names = getattr(self._model, "feature_names_in_", None)
        if train_names is not None:
            validate_against_training(dummy_df, train_names)
        else:
            if list(dummy_df.columns) != ALL_FEATURES:
                raise ValueError(
                    "Dérive détectée : les colonnes de build_features_for_inference "
                    "ne correspondent pas à ALL_FEATURES."
                )

        logger.info(
            "Modèle chargé | threshold=%.2f | features=%d | metadata=%s",
            self._threshold,
            len(ALL_FEATURES),
            self._metadata,
        )

    # ─── API publique ──────────────────────────────────────────────────────────
    def predict_delay_risk(
        self,
        dept_id: str,
        severity: str,
        raised_by_role: str,
        raised_at: datetime,
    ) -> Dict[str, Any]:
        """
        Retourne la prédiction de risque de dépassement de délai.
        """
        if self._model is None:
            raise RuntimeError(
                f"Le modèle n'est pas chargé. Cause : {self._load_error or 'inconnue'}. "
                "Placez le .joblib dans ML/ et redémarrez l'application."
            )

        df = build_features_for_inference([{
            "dept_id": dept_id,
            "severity": severity,
            "raised_by_role": raised_by_role,
            "raised_at": raised_at,
        }])

        X_in = df
        if self._preprocessor is not None:
            try:
                X_in = self._preprocessor.transform(df)
            except Exception as exc:
                logger.warning("Preprocessor failed, fallback raw features: %s", exc)
                X_in = df

        try:
            if hasattr(self._model, "predict_proba"):
                proba = self._model.predict_proba(X_in)[:, 1]
                risk_probability = float(np.squeeze(proba))
            else:
                risk_probability = float(np.squeeze(self._model.predict(X_in)))
        except Exception as exc:
            logger.exception("Erreur prédiction")
            raise RuntimeError(f"Prédiction échouée : {exc}") from exc

        will_be_delayed = risk_probability >= self._threshold

        if risk_probability < 0.3:
            risk_level = "low"
        elif risk_probability < self._threshold:
            risk_level = "medium"
        else:
            risk_level = "high"

        return {
            "risk_probability": round(risk_probability, 4),
            "will_be_delayed": bool(will_be_delayed),
            "risk_level": risk_level,
            "threshold_used": self._threshold,
            "model_version": self._metadata.get("version", "delay_risk_v1"),
            "features_used": df.iloc[0].to_dict(),
        }

    def healthcheck(self) -> Dict[str, Any]:
        return {
            "model_loaded": self._model is not None,
            "model_path": str(self.model_path),
            "threshold": self._threshold,
            "metadata": self._metadata,
            "load_error": self._load_error,
        }


# ─── Singleton module-level ──────────────────────────────────────────────────
delay_risk_service = DelayRiskService()