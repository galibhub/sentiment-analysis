from flask import Flask
from flask import request
from flask import jsonify
from flask_cors import CORS

from backend.predict import predict_sentiment


app = Flask(__name__)

CORS(app)


@app.route("/")
def home():

    return {
        "message": "Sentiment Analysis API Running"
    }


@app.route(
    "/predict",
    methods=["POST"]
)
def predict():

    data = request.get_json()

    text = data.get(
        "text",
        ""
    )

    if not text.strip():

        return jsonify(
            {
                "error": "Text cannot be empty"
            }
        ), 400

    sentiment = predict_sentiment(
        text
    )

    return jsonify(
        {
            "text": text,
            "sentiment": sentiment
        }
    )


if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5001,
        debug=True
    )