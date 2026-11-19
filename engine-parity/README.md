Original Python engine (`kille.py`, `utils.py`) and the script that turns it into
parity fixtures for the TypeScript port:

    pip install numpy termcolor tqdm prettytable
    python3 gen_fixtures.py ../src/engine/fixtures.json
    cd .. && npm run test:unit
