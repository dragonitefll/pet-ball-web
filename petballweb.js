angular.module("petBallWeb", ["ngMaterial"])
  .value("constraints", {video: true, audio: true})
  .value("webRTCConfig", {iceServers: [{url: "stun:stun.l.google.com:19302"}]})
  .controller("PetBallWebController", function($scope, constraints, webRTCConfig) {
    $scope.firebase = firebase;

    firebase.auth().onAuthStateChanged(function(user) {
      if (user) {
        user.getToken(true).then(function(token) {
          $scope.token = token;
          $scope.handshake();
        });
      } else {
        $scope.token = undefined;
      }
      $scope.currentUser = user;
      $scope.$apply();
    });

    $scope.signIn = function() {
      if ($scope.email && $scope.password) {
        firebase.auth().signInWithEmailAndPassword($scope.email, $scope.password).then(function(result) {
          console.log("Signed in!");
          console.debug(result);
        }, function(error) {
          console.log("Error");
          console.debug(error);
        })
      }
    };

    $scope.signalingChannel = new WebSocket("wss://petball.ward.li:3000");
    $scope.signalingChannel.onopen = $scope.handshake;

    $scope.needsHandshake = true;

    $scope.handshake = function() {
      if ($scope.signalingChannel.readyState == 1 && $scope.token && $scope.needsHandshake) {
        $scope.signalingChannel.send(JSON.stringify({
          hello: "web",
          token: $scope.token
        }));
        $scope.needsHandshake = false;
      }
    };

    $scope.startVideoCall = function() {
      navigator.getUserMedia(constraints, function(stream) {
        var video = document.getElementById("remote-stream");

        var pc = new webkitRTCPeerConnection(webRTCConfig);

        pc.addStream(stream);

        pc.createOffer().then(function(offer) {
          pc.setLocalDescription(offer);
        });

        pc.onnegotiationneeded = function() {
          $scope.signalingChannel.send(JSON.stringify({
            sdp: pc.localDescription,
            token: $scope.token
          }));
        }

        pc.onicecandidate = function(e) {
          if (e.candidate) {
            $scope.signalingChannel.send(JSON.stringify({
              candidate: e.candidate,
              token: $scope.token
            }));
          }
        };

        $scope.signalingChannel.onmessage = function(payload) {
          var message = JSON.parse(payload.data);
          if (message.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(message.sdp), function() {

            });
          } else {
            var parts = message.candidate.split(":");
            var candidate = new RTCIceCandidate({sdpMid: parts[0], sdpMLineIndex: parseInt(parts[1]), candidate: parts[2] + ":" + parts[3]});
            pc.addIceCandidate(candidate);
          }
        };

        pc.onaddstream = function(e) {
          window.event = e;
          video.src = window.URL.createObjectURL(e.stream);
        }
      }, angular.noop);
    };
  })
