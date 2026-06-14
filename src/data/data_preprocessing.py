import re
import nltk

nltk.download("stopwords")
nltk.download("wordnet")
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer


stop_words = set(
    stopwords.words("english")
)

stop_words = stop_words - {
    "not",
    "no",
    "but",
    "however",
    "yet"
} 


lemmatizer = WordNetLemmatizer()


def preprocess_text(text):

    text = str(text)

    text = text.lower()

    text = text.strip()

    text = re.sub(r"\n", " ", text)

    text = re.sub(r"http\S+", "", text)

    text = re.sub(
        r"[^A-Za-z0-9\s]",
        "",
        text
    )

    words = []

    for word in text.split():

        if word not in stop_words:

            words.append(
                lemmatizer.lemmatize(word)
            )

    return " ".join(words)