const http = require('http');

const BASE_URL = 'http://localhost:5000/api';

function makeRequest(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runApprovalSuite() {
  console.log('🚀 Running Dynamic Place & Route Approval System Verification Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Get tokens
    console.log('--- Step 1: Authentication & Role Tokens ---');
    const busOwnerAuth = await makeRequest('/company/login', 'POST', {
      email: 'orange@gmail.com',
      password: 'password123'
    });
    const busOwnerToken = busOwnerAuth.body.token;
    assert(busOwnerToken, 'Bus Owner authenticated successfully');

    const ownerAuth = await makeRequest('/owner/login', 'POST', {
      email: 'owner@antigravity.com',
      password: 'password123'
    });
    const ownerToken = ownerAuth.body.token;
    assert(ownerToken, 'Platform Owner authenticated successfully');

    // Test 14: Client API exposure check
    console.log('\n--- Test 14: Client API exposure check ---');
    const publicPlaces = await makeRequest('/places');
    assert(publicPlaces.status === 200 && Array.isArray(publicPlaces.body), 'Public places API accessible');

    // Test 12: Same source and destination check
    console.log('\n--- Test 12: Same source and destination route request ---');
    const samePlaceReq = await makeRequest('/company/route-requests', 'POST', {
      source_place_id: 1,
      destination_place_id: 1,
      reason: 'Self loop test'
    }, busOwnerToken);
    assert(samePlaceReq.status === 400, 'Same source & destination blocked with 400 Bad Request');

    // Test 13: Unauthorized Bus Owner attempts approval API
    console.log('\n--- Test 13: Authorization Protection ---');
    const unauthApprove = await makeRequest('/owner/place-requests/1/approve', 'PATCH', {}, busOwnerToken);
    assert(unauthApprove.status === 403 || unauthApprove.status === 401, 'Bus Owner blocked from Owner approval endpoint');

    // Test 3/4/5 & Test 8: Request place "BhimavaramTest" and Approve it
    console.log('\n--- Test 3/4/5 & Test 8: Place Request & Approval Flow ---');
    const uniquePlaceName = `TestCity_${Date.now()}`;
    const placeReqRes = await makeRequest('/company/place-requests', 'POST', {
      place_name: uniquePlaceName,
      state: 'Andhra Pradesh',
      district: 'West Godavari',
      reason: 'Test Suite Place'
    }, busOwnerToken);
    assert(placeReqRes.status === 201, `Place request for "${uniquePlaceName}" submitted cleanly`);
    const placeReqId = placeReqRes.body.requestId;

    // Test 6: Duplicate place request check
    console.log('\n--- Test 6: Duplicate Place Request Prevention ---');
    const dupPlaceReq = await makeRequest('/company/place-requests', 'POST', {
      place_name: uniquePlaceName,
      state: 'Andhra Pradesh'
    }, busOwnerToken);
    assert(dupPlaceReq.status === 409, 'Duplicate pending place request blocked with 409 Conflict');

    // Approve Place
    console.log('\n--- Owner Approving Place Request ---');
    const approvePlaceRes = await makeRequest(`/owner/place-requests/${placeReqId}/approve`, 'PATCH', {}, ownerToken);
    assert(approvePlaceRes.status === 200, `Owner approved place request #${placeReqId}`);

    // Verify Place is now in public places
    const updatedPlaces = await makeRequest('/places');
    const newPlaceObj = (updatedPlaces.body || []).find(p => p.name.toLowerCase() === uniquePlaceName.toLowerCase());
    assert(newPlaceObj !== undefined, `Newly approved place "${uniquePlaceName}" is now centrally available in public places API`);

    // Test 2 & Test 10: Route Request & Approval Flow
    console.log('\n--- Test 2 & Test 10: Route Request & Approval Flow ---');
    const destPlaceObj = (updatedPlaces.body || []).find(p => p.id !== newPlaceObj.id);
    const routeReqRes = await makeRequest('/company/route-requests', 'POST', {
      source_place_id: newPlaceObj.id,
      destination_place_id: destPlaceObj.id,
      reason: 'Test Route Connection'
    }, busOwnerToken);
    assert(routeReqRes.status === 201, `Route request "${newPlaceObj.name} → ${destPlaceObj.name}" submitted cleanly`);
    const routeReqId = routeReqRes.body.requestId;

    // Test 7: Duplicate route request check
    console.log('\n--- Test 7: Duplicate Route Request Prevention ---');
    const dupRouteReq = await makeRequest('/company/route-requests', 'POST', {
      source_place_id: newPlaceObj.id,
      destination_place_id: destPlaceObj.id
    }, busOwnerToken);
    assert(dupRouteReq.status === 409, 'Duplicate pending route request blocked with 409 Conflict');

    // Approve Route
    console.log('\n--- Owner Approving Route Request ---');
    const approveRouteRes = await makeRequest(`/owner/route-requests/${routeReqId}/approve`, 'PATCH', {}, ownerToken);
    assert(approveRouteRes.status === 200, `Owner approved route request #${routeReqId}`);

    // Test 1: Route now exists in company routes list
    console.log('\n--- Test 1: Route Availability Check ---');
    const companyRoutes = await makeRequest('/company/routes', 'GET', null, busOwnerToken);
    const approvedRouteObj = (companyRoutes.body || []).find(r => r.from_city.toLowerCase() === newPlaceObj.name.toLowerCase());
    assert(approvedRouteObj !== undefined, `Approved route "${newPlaceObj.name} → ${destPlaceObj.name}" is immediately available to Bus Owner`);

    // Test 9: Reject Place Request Test
    console.log('\n--- Test 9: Owner Reject Place Request ---');
    const rejectPlaceName = `RejectCity_${Date.now()}`;
    const rPlaceReq = await makeRequest('/company/place-requests', 'POST', {
      place_name: rejectPlaceName,
      state: 'Telangana'
    }, busOwnerToken);
    const rApprove = await makeRequest(`/owner/place-requests/${rPlaceReq.body.requestId}/reject`, 'PATCH', {
      rejection_reason: 'Invalid city boundaries'
    }, ownerToken);
    assert(rApprove.status === 200, 'Place request rejected successfully');

    console.log(`\n==============================================`);
    console.log(`🎉 TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==============================================\n`);

  } catch (err) {
    console.error('Test suite execution error:', err);
  }
}

runApprovalSuite();
