
import joblib
from src.data.data_preprocessing import preprocess_text
from src.features.vectorization import vectorize_text

MODEL_PATH = "models/final_model.pkl"


# load model

def load_model():
    model = joblib.load(
        MODEL_PATH
        )
    return model


# predict Sentiment

def predict_sentiment(text):
    clean_text = preprocess_text(text)

    vector = vectorize_text(clean_text)
     
    model = load_model()

    prediction = model.predict(
        vector
    )[0]

    label_map ={
        0:"Neutral",
        1:"Positive",
        2:"Negtive"
    }

    return label_map[prediction]