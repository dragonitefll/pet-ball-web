angular.module("petBallWeb", ["ngMaterial"])
  .value("constraints", {video: true, audio: true})
  .controller("PetBallWebController", function($scope, constraints) {
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

    $scope.signalingChannel = new WebSocket("ws://petball.ward.li");
    $scope.signalingChannel.onopen = $scope.handshake;

    $scope.handshake = function() {
      if ($scope.signalingChannel.readyState == 1 && $scope.token) {
        $scope.signalingChannel.send(JSON.stringify({
          hello: "web",
          token: $scope.token
        }));
      }
    };

    $scope.startVideoCall = function() {
      navigator.getUserMedia(constraints, function(stream) {
        var video = document.getElementById("local-stream");
        video.muted = true;
        video.src = window.URL.createObjectURL(stream);
        video.play();

        var pc = new webkitRTCPeerConnection(null);
        pc.addStream(stream);

        pc.onnegotiationneeded = function() {
          pc.createOffer(function(desc) {
            pc.setLocalDescription(desc, function() {
              $scope.signalingChannel.send(JSON.stringify({
                sdp: pc.localDescription,
                token: $scope.token
              }));
            });
          });
        };

        pc.onicecandidate = function(e) {
          if (e.candidate) {
            $scope.signalingChannel.send(JSON.stringify({
              candidate: e.candidate,
              token: $scope.token
            }));
          }
        };

        $scope.signalingChannel.onmessage = function(payload) {
          var message = JSON.parse(payload);
          if (message.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(message.sdp), function() {

            });
          } else {
            pc.addIceCandidate(new RTCIceCandidate(message.candidate));
          }
        };

        pc.onaddstream = function(e) {
          console.log(e);
        };
      }, angular.noop);
    };
  })
