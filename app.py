from flask import Flask, render_template

app = Flask(__name__)

# Home page (index.html)
@app.route('/')
def index():
    return render_template('index.html', title="Home")

# Summary page (after clicking "New Tournament")
@app.route('/summary')
def summary():
    return render_template('summary.html', title="Summary")

# Check-in page
@app.route('/checkin')
def checkin():
    return render_template('checkin.html', title="Check-in")

# Add other pages as needed
@app.route('/seeding')
def seeding():
    return render_template('seeding.html', title="Seeding")

@app.route('/pools')
def pools():
    return render_template('pools.html', title="Pools")

@app.route('/de')
def de():
    return render_template('de.html', title="DE")

if __name__ == '__main__':
    app.run(debug=True)
