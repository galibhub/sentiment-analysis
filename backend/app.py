from flask import Flask
from flask import request
from flask import jsonify

from predict import predict_sentiment


app = Flask(__name__)


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
        port=5000,
        debug=True
    )