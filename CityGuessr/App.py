import os
from flask import Flask, render_template, abort
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

CIUDADES = {
    "buenos-aires": {
        "nombre": "Buenos Aires",
        "norte": -34.53,
        "sur": -34.69,
        "oeste": -58.53,
        "este": -58.36,
    },
}


@app.route("/")
def index():
    return render_template("index.html", ciudades=CIUDADES)


@app.route("/jugar/<slug>")
def jugar(slug):
    ciudad = CIUDADES.get(slug)
    if ciudad is None:
        abort(404)
    return render_template(
        "game.html",
        ciudad=ciudad,
        mapillary_token=os.getenv("MAPILLARY_TOKEN", ""),
    )


if __name__ == "__main__":
    app.run(debug=True)