import joblib
VECTORIZER_PATH = "models/tfidf_vectorizer.pkl"


def load_vectorizer():
    vectorizer = joblib.load(
        VECTORIZER_PATH
    )
    return vectorizer


def vectorize_text(text):
    vectorizer = load_vectorizer()
    vector = vectorizer.transform(
        [text]
    )
    return vector
