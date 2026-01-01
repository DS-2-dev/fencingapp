from flask import Flask, render_template, redirect, url_for
import os
import xml.etree.ElementTree as ET
from glob import glob

app = Flask(__name__)

# Home page (index.html)
@app.route('/')
def index():
    return render_template('index.html', title="Home")

# Summary page (after clicking "New Tournament")
@app.route('/summary')
def summary():
    # Parse most recent .frd file to extract tournament metadata
    tournament = {}
    event = {}
    frd_files = sorted(glob('*.frd'), key=lambda f: os.path.getmtime(f), reverse=True)
    if frd_files:
        try:
            tree = ET.parse(frd_files[0])
            root = tree.getroot()
            # Handle XML namespace
            namespace = {'ns': 'http://www.askfred.net'}
            tourn_elem = root.find('.//ns:Tournament', namespace)
            if tourn_elem is not None:
                fee_amount = tourn_elem.get('Fee', '0.00')
                fee_currency = tourn_elem.get('FeeCurrency', 'USD')
                
                # Format fee with currency symbol
                currency_symbols = {
                    'USD': '$',
                    'EUR': '€',
                    'GBP': '£',
                    'JPY': '¥',
                    'CAD': 'C$',
                    'AUD': 'A$'
                }
                symbol = currency_symbols.get(fee_currency, fee_currency + ' ')
                formatted_fee = f"{symbol}{fee_amount}"
                
                tournament = {
                    'name': tourn_elem.get('Name', 'N/A'),
                    'location': tourn_elem.get('Location', 'N/A'),
                    'date': tourn_elem.get('StartDate', 'N/A'),
                    'fee': formatted_fee,
                    'id': tourn_elem.get('TournamentID', 'N/A')
                }
            
            # Parse first event data
            event_elem = root.find('.//ns:Event', namespace)
            if event_elem is not None:
                event_time_raw = event_elem.get('EventDateTime', 'N/A')
                # Extract only time portion (HH:MM:SS) from datetime string
                if event_time_raw != 'N/A' and ' ' in event_time_raw:
                    event_time = event_time_raw.split(' ', 1)[1]
                else:
                    event_time = event_time_raw
                weapon = event_elem.get('Weapon', 'N/A')
                gender = event_elem.get('Gender', 'N/A')
                gender_mixed = 'Yes' if gender == 'Mixed' else 'No'
                
                age_min = event_elem.get('AgeLimitMin', '')
                age_max = event_elem.get('AgeLimitMax', '')
                enforce_age = event_elem.get('EnforceAge', 'False')
                if enforce_age == 'False' or not age_min:
                    age_limit = 'None'
                elif age_min == age_max:
                    age_limit = age_min
                else:
                    age_limit = f"{age_min} - {age_max}"
                
                rating_limit = event_elem.get('RatingLimit', 'Open')
                enforce_rating = event_elem.get('EnforceRating', 'False')
                if enforce_rating == 'False' or rating_limit == 'Open':
                    rating_limit = 'None'
                
                event_id = event_elem.get('EventID', 'N/A')
                
                event = {
                    'time': event_time,
                    'weapon': weapon,
                    'gender_mixed': gender_mixed,
                    'age_limit': age_limit,
                    'rating_limit': rating_limit,
                    'id': event_id
                }
        except Exception as e:
            print(f'Error parsing .frd file: {e}')
    return render_template('summary.html', title="Summary", tournament=tournament, event=event)

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


@app.route('/continue')
def cont():
    # Continue/resume tournament — redirect to last page they were at before clicking home ~ still saves all data
    # is read client-side so the user doesn't need to re-import.
    return redirect(url_for('seeding'))

if __name__ == '__main__':
    app.run(debug=True)
